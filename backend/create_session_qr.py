#!/usr/bin/env python3
"""
Script to create a table session and generate a QR code with the deep link.
The QR code contains: yopagocl://session/{session_id}
"""
import sys
import uuid
from datetime import datetime
from pathlib import Path
from sqlmodel import select

import httpx
import qrcode

from db.session import SessionLocal
from models.restaurants import Restaurant
from models.restaurant_tables import RestaurantTable

# Configuration
BASE_URL = "http://localhost:8000"  # Change this to your backend URL
API_ENDPOINT = f"{BASE_URL}/api/table_sessions"


def create_session(restaurant_id: str, table_id: str, items: list[dict] = None) -> dict:
    """
    Create a new table session via POST request.
    
    Args:
        restaurant_id: Restaurant identifier
        table_id: Table UUID
        items: List of order items (optional)
    
    Returns:
        Session response with session_id
    """
    if items is None:
        items = []
    
    session_data = {
        "restaurant_id": restaurant_id,
        "table_id": table_id,
        "session_start": datetime.now().isoformat(),
        "items": items
    }
    
    print(f"Creating session at {API_ENDPOINT}...")
    print(f"Session data: {session_data}")
    
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(API_ENDPOINT, json=session_data)
            response.raise_for_status()
            session = response.json()
            print(f"✓ Session created successfully!")
            print(f"  Session ID: {session['id']}")
            return session
    except httpx.HTTPStatusError as e:
        print(f"✗ Error creating session: {e.response.status_code}")
        print(f"  Response: {e.response.text!s}")
        # Try to parse error details if available
        try:
            error_detail = e.response.json()
            if "detail" in error_detail:
                print(f"  Error detail: {error_detail['detail']}")
        except Exception:
            pass
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"✗ Request error: {e}")
        sys.exit(1)


def get_first_restaurant_and_table() -> tuple[str, str]:
    """
    Get the first restaurant and its first table from the database.
    
    Returns:
        Tuple of (restaurant_id, table_id)
    """
    db = SessionLocal()
    try:
        # Get first restaurant
        restaurant = db.scalars(select(Restaurant)).first()
        if not restaurant:
            print("✗ Error: No restaurants found in database.")
            print("  Run create_restaurant_table.py first to create a restaurant and table.")
            sys.exit(1)
        
        # Get first table for this restaurant
        table = db.scalars(
            select(RestaurantTable).where(
                RestaurantTable.restaurant_id == restaurant.rut
            )
        ).first()
        
        if not table:
            print(f"✗ Error: No tables found for restaurant {restaurant.name} (RUT: {restaurant.rut})")
            print("  Run create_restaurant_table.py to create a table.")
            sys.exit(1)
        
        print(f"✓ Using restaurant: {restaurant.name} (RUT: {restaurant.rut})")
        print(f"✓ Using table: {table.table_number} (ID: {table.id})")
        
        return restaurant.rut, str(table.id)
    finally:
        db.close()


def generate_qr_code(session_id: str, output_path: str = None) -> str:
    """
    Generate a QR code with the deep link yopagocl://session/{session_id}
    
    Args:
        session_id: The session UUID
        output_path: Optional path to save the QR code image (relative to qr_codes folder)
    
    Returns:
        Path to the saved QR code image
    """
    deep_link = f"yopagocl://session/{session_id}"
    print(f"\nGenerating QR code for: {deep_link}")
    
    # Create qr_codes directory if it doesn't exist
    qr_dir = Path("qr_codes")
    qr_dir.mkdir(exist_ok=True)
    
    # Create QR code instance
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    
    qr.add_data(deep_link)
    qr.make(fit=True)
    
    # Create image
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Determine output path
    if output_path is None:
        filename = f"session_{session_id}_qr.png"
    else:
        # If output_path is provided, use it but ensure it's in qr_codes folder
        filename = Path(output_path).name
    
    # Save to qr_codes directory
    output_path = qr_dir / filename
    img.save(output_path)
    
    print(f"✓ QR code saved to: {output_path}")
    print(f"  Deep link: {deep_link}")
    print(f"  WebSocket endpoint: ws://localhost:8000/api/ws/table_sessions/{session_id}")
    
    return str(output_path)


def main():
    """Main function to create session and generate QR code."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Create a table session and generate QR code"
    )
    parser.add_argument(
        "--restaurant-id",
        type=str,
        default=None,
        help="Restaurant identifier (RUT). If not provided, uses first restaurant from database."
    )
    parser.add_argument(
        "--table-id",
        type=str,
        default=None,
        help="Table UUID. If not provided, uses first table of the restaurant."
    )
    parser.add_argument(
        "--base-url",
        type=str,
        default="http://localhost:8000",
        help="Backend base URL (default: http://localhost:8000)"
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Output path for QR code image (default: session_{session_id}_qr.png)"
    )
    parser.add_argument(
        "--items",
        type=str,
        nargs="*",
        help="Order items in format 'name:price' (e.g., 'Pizza:15000 Burger:12000')"
    )
    
    args = parser.parse_args()
    
    # Update BASE_URL if provided
    global BASE_URL, API_ENDPOINT
    BASE_URL = args.base_url
    API_ENDPOINT = f"{BASE_URL}/api/table_sessions"
    
    # Get restaurant_id and table_id
    if args.restaurant_id is None or args.table_id is None:
        print("No restaurant-id or table-id provided, fetching from database...")
        restaurant_id, table_id = get_first_restaurant_and_table()
    else:
        restaurant_id = args.restaurant_id
        table_id = args.table_id
    
    # Validate table_id is a valid UUID
    try:
        table_uuid = str(uuid.UUID(table_id))
    except ValueError:
        print(f"✗ Error: '{table_id}' is not a valid UUID")
        sys.exit(1)
    
    # Parse items if provided
    items = []
    if args.items:
        for item_str in args.items:
            try:
                name, price = item_str.split(":", 1)
                items.append({
                    "item_name": name.strip(),
                    "unit_price": int(price.strip())
                })
            except ValueError:
                print(f"⚠ Warning: Invalid item format '{item_str}', skipping. Use 'name:price'")
    
    # Create session
    session = create_session(
        restaurant_id=restaurant_id,
        table_id=table_uuid,
        items=items
    )
    
    # Generate QR code
    qr_path = generate_qr_code(
        session_id=session["id"],
        output_path=args.output
    )
    
    print(f"\n✓ Done! Session created and QR code generated.")
    print(f"  Session ID: {session['id']}")
    print(f"  QR Code: {qr_path}")


if __name__ == "__main__":
    main()

