import uuid
import httpx
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.deps import SessionDep, CurrentUser
from crud import reminders as crud_reminders
from crud import invoices as crud_invoices
from crud import auth as crud_auth
from models.users import User
from schemas.reminders import PaymentReminderCreate, PaymentReminderResponse

router = APIRouter(prefix="/reminders", tags=["reminders"])


class SendPushNotificationRequest(BaseModel):
    """Request to send a push notification."""
    invoice_id: uuid.UUID
    message: Optional[str] = None


@router.post("", response_model=PaymentReminderResponse, status_code=201)
def create_reminder(reminder_data: PaymentReminderCreate, db: SessionDep):
    """Create a payment reminder."""
    # Verify invoice exists
    invoice = crud_invoices.get_invoice_by_id(db, reminder_data.invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    reminder = crud_reminders.create_reminder(db, reminder_data)
    return reminder


@router.get("/invoices/{invoice_id}/reminders", response_model=list[PaymentReminderResponse])
def get_invoice_reminders(invoice_id: uuid.UUID, db: SessionDep):
    """Get reminders for an invoice."""
    invoice = crud_invoices.get_invoice_by_id(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    reminders = crud_reminders.get_invoice_reminders(db, invoice_id)
    return reminders


@router.get("", response_model=list[PaymentReminderResponse])
def list_reminders(
    invoice_id: Optional[uuid.UUID] = Query(None, description="Filter by invoice"),
    status: Optional[str] = Query(None, description="Filter by status"),
    db: SessionDep = None
):
    """List reminders with optional filters."""
    reminders = crud_reminders.list_reminders(db, invoice_id=invoice_id, status=status)
    return reminders


@router.post("/send-push-notification")
async def send_push_notification(
    notification_data: SendPushNotificationRequest,
    current_user: CurrentUser,
    db: SessionDep
):
    """Send a push notification to the debtor of an invoice.
    
    Args:
        notification_data: Invoice ID and optional message
        current_user: Current authenticated user (must be the creditor)
        db: Database session
    
    Returns:
        Success message
    """
    # Verify invoice exists
    invoice = crud_invoices.get_invoice_by_id(db, notification_data.invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Verify current user is the creditor (to_user)
    if invoice.to_user != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the creditor can send reminders for this invoice"
        )
    
    # Get the debtor (from_user)
    debtor = db.get(User, invoice.from_user)
    if not debtor:
        raise HTTPException(status_code=404, detail="Debtor not found")
    
    # Check if debtor has a push notification token
    if not debtor.push_notification_token:
        raise HTTPException(
            status_code=400,
            detail="The person who owes you money hasn't enabled push notifications yet. They need to open the app and grant notification permissions."
        )
    
    # Create a reminder record
    reminder_data = PaymentReminderCreate(
        invoice_id=notification_data.invoice_id,
        send_at=datetime.now(),
        message=notification_data.message,
        near_to_due_date=False
    )
    reminder = crud_reminders.create_reminder(db, reminder_data)
    
    # Prepare notification message
    creditor_name = current_user.name or current_user.email
    amount = invoice.total_amount / 100  # Convert from centavos
    default_message = f"{creditor_name} is reminding you about a payment of ${amount:,.0f} CLP"
    notification_message = notification_data.message or default_message
    
    # Send push notification via Expo
    try:
        # Prepare notification payload
        notification_payload = {
            "to": debtor.push_notification_token,
            "sound": "default",
            "title": "Payment Reminder",
            "body": notification_message,
            "data": {
                "invoice_id": str(invoice.id),
                "type": "payment_reminder"
            }
        }
        
        print(f"[Push Notification] Sending to token: {debtor.push_notification_token[:20]}...")
        print(f"[Push Notification] Payload: {notification_payload}")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://exp.host/--/api/v2/push/send",
                json=notification_payload,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json"
                },
                timeout=10.0
            )
            response.raise_for_status()
            
            # Try to parse JSON response
            try:
                result = response.json()
            except Exception as json_error:
                print(f"[Push Notification] Failed to parse JSON response: {json_error}")
                print(f"[Push Notification] Response status: {response.status_code}")
                print(f"[Push Notification] Response text: {response.text[:500]}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Invalid JSON response from push notification service: {str(json_error)}"
                )
            
            # Log the response for debugging
            print(f"[Push Notification] Expo API response: {result}")
            
            # Expo returns a dict with "data" key
            # For a single notification, "data" is a dict
            # For multiple notifications, "data" is a list
            if result.get("data"):
                data = result["data"]
                
                # Handle both single notification (dict) and multiple notifications (list)
                if isinstance(data, dict):
                    # Single notification response
                    status = data.get("status")
                    if status == "ok":
                        # Update reminder status to sent
                        reminder.status = "sent"
                        db.add(reminder)
                        db.commit()
                        db.refresh(reminder)
                        return {"message": "Push notification sent successfully", "reminder": reminder}
                    else:
                        # Handle error status
                        error_message = data.get("message", "Unknown error")
                        error_details = data.get("details", {})
                        full_error = f"{error_message}"
                        if error_details:
                            full_error += f" (Details: {error_details})"
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to send push notification: {full_error}"
                        )
                elif isinstance(data, list) and len(data) > 0:
                    # Multiple notifications response (list)
                    first_result = data[0]
                    status = first_result.get("status")
                    
                    if status == "ok":
                        # Update reminder status to sent
                        reminder.status = "sent"
                        db.add(reminder)
                        db.commit()
                        db.refresh(reminder)
                        return {"message": "Push notification sent successfully", "reminder": reminder}
                    else:
                        # Handle error status
                        error_message = first_result.get("message", "Unknown error")
                        error_details = first_result.get("details", {})
                        full_error = f"{error_message}"
                        if error_details:
                            full_error += f" (Details: {error_details})"
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to send push notification: {full_error}"
                        )
                else:
                    # Log the actual response structure for debugging
                    print(f"[Push Notification] Unexpected data format: {data} (type: {type(data)})")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Invalid response from push notification service. Expected dict or list, got: {type(data)}"
                    )
            else:
                # Log the full response for debugging
                print(f"[Push Notification] No 'data' key in response. Full response: {result}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to send push notification: No data in response. Response: {result}"
                )
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error sending push notification: {str(e)}"
        )

