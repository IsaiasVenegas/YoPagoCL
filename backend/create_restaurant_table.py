#!/usr/bin/env python3
"""
Script to create a restaurant with a table in the database.
If restaurant or user don't exist, they will be created.
"""
import sys
import uuid
import secrets
from sqlmodel import select, Session

from db.session import SessionLocal
from models.restaurants import Restaurant
from models.restaurant_tables import RestaurantTable
from models.users import User


def get_or_create_user(db: Session, email: str = "admin@yopagocl.com", name: str = "Admin User") -> User:
    """Get existing user or create a new one."""
    user = db.scalars(select(User).where(User.email == email)).first()
    
    if user:
        print(f"✓ Using existing user: {user.email} (ID: {user.id})")
        return user
    
    # Create new user
    user = User(
        id=uuid.uuid4(),
        email=email,
        name=name,
        hashed_password=None
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"✓ Created new user: {user.email} (ID: {user.id})")
    return user


def get_or_create_restaurant(
    db: Session,
    rut: str,
    name: str,
    owner: User,
    slug: str | None = None
) -> Restaurant:
    """Get existing restaurant or create a new one."""
    restaurant = db.get(Restaurant, rut)
    
    if restaurant:
        print(f"✓ Using existing restaurant: {restaurant.name} (RUT: {restaurant.rut})")
        return restaurant
    
    # Generate slug if not provided
    if slug is None:
        slug = name.lower().replace(" ", "-")[:100]
        # Ensure slug is unique
        existing = db.scalars(select(Restaurant).where(Restaurant.slug == slug)).first()
        if existing:
            slug = f"{slug}-{secrets.token_urlsafe(4)[:8]}"
    
    # Create new restaurant
    restaurant = Restaurant(
        rut=rut,
        name=name,
        slug=slug,
        owner=owner.id,
        description=f"Restaurant {name}"
    )
    db.add(restaurant)
    db.commit()
    db.refresh(restaurant)
    print(f"✓ Created new restaurant: {restaurant.name} (RUT: {restaurant.rut})")
    return restaurant


def get_or_create_table(
    db: Session,
    restaurant: Restaurant,
    table_number: str = "1"
) -> RestaurantTable:
    """Get existing table or create a new one."""
    # Check if table already exists
    existing_table = db.scalars(
        select(RestaurantTable).where(
            RestaurantTable.restaurant_id == restaurant.rut,
            RestaurantTable.table_number == table_number
        )
    ).first()
    
    if existing_table:
        print(f"✓ Using existing table: {table_number} (ID: {existing_table.id})")
        return existing_table
    
    # Create new table
    table = RestaurantTable(
        restaurant_id=restaurant.rut,
        table_number=table_number
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    print(f"✓ Created new table: {table_number} (ID: {table.id})")
    return table


def main():
    """Main function to create restaurant and table."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Create a restaurant with a table in the database"
    )
    parser.add_argument(
        "--rut",
        type=str,
        default="12345678-9",
        help="Restaurant RUT (default: 12345678-9)"
    )
    parser.add_argument(
        "--name",
        type=str,
        default="Test Restaurant",
        help="Restaurant name (default: Test Restaurant)"
    )
    parser.add_argument(
        "--table-number",
        type=str,
        default="1",
        help="Table number (default: 1)"
    )
    parser.add_argument(
        "--user-email",
        type=str,
        default="admin@yopagocl.com",
        help="Owner user email (default: admin@yopagocl.com)"
    )
    parser.add_argument(
        "--user-name",
        type=str,
        default="Admin User",
        help="Owner user name (default: Admin User)"
    )
    
    args = parser.parse_args()
    
    # Create database session
    db = SessionLocal()
    
    try:
        # Get or create user
        user = get_or_create_user(db, args.user_email, args.user_name)
        
        # Get or create restaurant
        restaurant = get_or_create_restaurant(
            db,
            rut=args.rut,
            name=args.name,
            owner=user
        )
        
        # Get or create table
        table = get_or_create_table(
            db,
            restaurant=restaurant,
            table_number=args.table_number
        )
        
        print("\n" + "="*60)
        print("✓ Success! Restaurant and table created/retrieved:")
        print("="*60)
        print(f"  Restaurant RUT: {restaurant.rut}")
        print(f"  Restaurant Name: {restaurant.name}")
        print(f"  Table Number: {table.table_number}")
        print(f"  Table ID: {table.id}")
        print(f"  Owner: {user.name} ({user.email})")
        print("="*60)
        print("\nYou can now use these values in create_session_qr.py:")
        print(f"  --restaurant-id {restaurant.rut}")
        print(f"  --table-id {table.id}")
        
    except Exception as e:
        print(f"✗ Error: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

