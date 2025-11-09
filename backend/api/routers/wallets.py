import uuid
import httpx
import logging
import time
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request

from api.deps import SessionDep, CurrentUser
from crud import wallets as crud_wallets
from schemas.wallets import (
    WalletResponse,
    WalletTransactionResponse,
    WalletWithTransactionsResponse,
    WalletTopUpRequest,
    WalletTopUpResponse,
)

router = APIRouter(prefix="/wallets", tags=["wallets"])


@router.get("/users/{user_id}", response_model=WalletResponse)
def get_user_wallet(user_id: uuid.UUID, db: SessionDep):
    """Get wallet for a user. Creates wallet if it doesn't exist."""
    wallet = crud_wallets.get_or_create_wallet(db, user_id)
    return wallet


@router.get("/users/{user_id}/with-transactions", response_model=WalletWithTransactionsResponse)
def get_user_wallet_with_transactions(
    user_id: uuid.UUID,
    limit: Optional[int] = Query(None, description="Limit number of transactions"),
    db: SessionDep = None
):
    """Get wallet with recent transactions for a user."""
    wallet = crud_wallets.get_wallet_with_transactions(db, user_id, limit=limit)
    if not wallet:
        wallet = crud_wallets.get_or_create_wallet(db, user_id)
    return wallet


@router.get("/{wallet_id}", response_model=WalletResponse)
def get_wallet(wallet_id: uuid.UUID, db: SessionDep):
    """Get wallet by ID."""
    wallet = crud_wallets.get_wallet_by_id(db, wallet_id)
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet


@router.get("/{wallet_id}/transactions", response_model=list[WalletTransactionResponse])
def get_wallet_transactions(
    wallet_id: uuid.UUID,
    limit: Optional[int] = Query(None, description="Limit number of transactions"),
    db: SessionDep = None
):
    """Get transactions for a wallet."""
    transactions = crud_wallets.get_wallet_transactions(
        db, wallet_id=wallet_id, limit=limit
    )
    return transactions


@router.get("/users/{user_id}/transactions", response_model=list[WalletTransactionResponse])
def get_user_transactions(
    user_id: uuid.UUID,
    limit: Optional[int] = Query(None, description="Limit number of transactions"),
    db: SessionDep = None
):
    """Get transactions for a user's wallet."""
    transactions = crud_wallets.get_wallet_transactions(
        db, user_id=user_id, limit=limit
    )
    return transactions


@router.post("/top-up", response_model=WalletTopUpResponse)
async def top_up_wallet(
    request: Request,
    top_up_data: WalletTopUpRequest,
    current_user: CurrentUser,
    db: SessionDep
):
    """Add money to user's wallet using Transbank integration."""
    # Log incoming request details
    logging.info(f"[Wallet Top-Up] Request received for user: {current_user.id}")
    logging.info(f"[Wallet Top-Up] Request body: {top_up_data.model_dump()}")
    logging.info(f"[Wallet Top-Up] Request headers: {dict(request.headers)}")
    
    # Get or create wallet
    wallet = crud_wallets.get_or_create_wallet(db, current_user.id)
    logging.info(f"[Wallet Top-Up] Wallet ID: {wallet.id}, Current balance: {wallet.balance}")
    
    # Create Transbank transaction (integration environment)
    # For integration, we'll simulate the payment flow
    try:
        # Transbank Webpay Plus REST API - Create transaction
        transbank_url = "https://webpay3gint.transbank.cl/rswebpaytransaction/api/webpay/v1.2/transactions"
        
        # Integration credentials (from Transbank docs)
        headers = {
            "Tbk-Api-Key-Id": "597055555532",  # Integration commerce code
            "Tbk-Api-Key-Secret": "579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C",  # Integration secret
            "Content-Type": "application/json"
        }
        
        # Convert CLP to pesos for Transbank
        amount_pesos = top_up_data.amount / 100
        logging.info(f"[Wallet Top-Up] Amount in CLP: {top_up_data.amount}, Amount in pesos: {amount_pesos}")
        
        # Generate buy_order: must be max 26 chars, alphanumeric only
        # Format: "TOPUP" + timestamp (10 digits) + random (11 chars) = 26 chars total
        timestamp = str(int(time.time()))[-10:]  # Last 10 digits of timestamp
        random_part = uuid.uuid4().hex[:11]  # First 11 hex chars (no hyphens)
        buy_order = f"TOPUP{timestamp}{random_part}"[:26]  # Ensure max 26 chars
        
        payload = {
            "buy_order": buy_order,
            "session_id": str(current_user.id),
            "amount": amount_pesos,
            "return_url": "https://www.comercio.cl/webpay/retorno"  # Dummy return URL for integration
        }
        logging.info(f"[Wallet Top-Up] Transbank payload: {payload}")
        
        async with httpx.AsyncClient() as client:
            logging.info(f"[Wallet Top-Up] Calling Transbank API: {transbank_url}")
            response = await client.post(transbank_url, json=payload, headers=headers, timeout=30.0)
            logging.info(f"[Wallet Top-Up] Transbank response status: {response.status_code}")
            logging.info(f"[Wallet Top-Up] Transbank response body: {response.text}")
            response.raise_for_status()
            transbank_data = response.json()
            logging.info(f"[Wallet Top-Up] Transbank response JSON: {transbank_data}")
            
            # In integration mode, Transbank returns a token immediately
            transbank_token = transbank_data.get("token")
            logging.info(f"[Wallet Top-Up] Transbank token: {transbank_token}")
            
            # For integration, we'll simulate successful payment and add to wallet
            # In production, you'd verify the payment status first
            transaction = crud_wallets.create_wallet_transaction(
                db=db,
                wallet_id=wallet.id,
                transaction_type="deposit",
                amount=top_up_data.amount,
                currency=top_up_data.currency,
                description=f"Wallet top-up via Transbank"
            )
            
            # Refresh wallet to get updated balance
            db.refresh(wallet)
            logging.info(f"[Wallet Top-Up] Transaction created: {transaction.id}, New balance: {wallet.balance}")
            
            response_data = WalletTopUpResponse(
                transaction_id=transaction.id,
                wallet_id=wallet.id,
                amount=top_up_data.amount,
                balance=wallet.balance,
                transbank_token=transbank_token
            )
            logging.info(f"[Wallet Top-Up] Success! Returning response: {response_data.model_dump()}")
            return response_data
            
    except httpx.HTTPError as e:
        logging.error(f"[Wallet Top-Up] HTTPError from Transbank: {str(e)}")
        logging.error(f"[Wallet Top-Up] Response: {e.response.text if hasattr(e, 'response') else 'No response'}")
        raise HTTPException(status_code=500, detail=f"Transbank API error: {str(e)}")
    except Exception as e:
        logging.error(f"[Wallet Top-Up] Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process top-up: {str(e)}")

