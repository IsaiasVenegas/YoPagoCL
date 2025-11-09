import uuid
from typing import Optional
from sqlmodel import select, Session
from models.wallets import Wallet
from models.wallet_transactions import WalletTransaction


def get_or_create_wallet(db: Session, user_id: uuid.UUID, commit: bool = True) -> Wallet:
    """Get wallet for user, create if it doesn't exist."""
    wallet = db.exec(select(Wallet).where(Wallet.user_id == user_id)).first()
    if not wallet:
        wallet = Wallet(user_id=user_id, balance=0, currency="CLP")
        db.add(wallet)
        if commit:
            db.commit()
            db.refresh(wallet)
        else:
            db.flush()
    return wallet


def get_wallet_by_user_id(db: Session, user_id: uuid.UUID) -> Optional[Wallet]:
    """Get wallet by user ID."""
    return db.exec(select(Wallet).where(Wallet.user_id == user_id)).first()


def get_wallet_by_id(db: Session, wallet_id: uuid.UUID) -> Optional[Wallet]:
    """Get wallet by ID."""
    return db.get(Wallet, wallet_id)


def create_wallet_transaction(
    db: Session,
    wallet_id: uuid.UUID,
    transaction_type: str,
    amount: int,
    settlement_id: Optional[uuid.UUID] = None,
    currency: str = "CLP",
    description: Optional[str] = None,
    commit: bool = True
) -> WalletTransaction:
    """Create a wallet transaction and update wallet balance."""
    wallet = db.get(Wallet, wallet_id)
    if not wallet:
        raise ValueError(f"Wallet {wallet_id} not found")
    
    # Create transaction
    transaction = WalletTransaction(
        wallet_id=wallet_id,
        settlement_id=settlement_id,
        type=transaction_type,
        amount=amount,
        currency=currency,
        description=description
    )
    db.add(transaction)
    
    # Update wallet balance
    wallet.balance += amount
    db.add(wallet)
    
    if commit:
        db.commit()
        db.refresh(transaction)
        db.refresh(wallet)
    else:
        db.flush()
    
    return transaction


def get_wallet_transactions(
    db: Session,
    wallet_id: Optional[uuid.UUID] = None,
    user_id: Optional[uuid.UUID] = None,
    limit: Optional[int] = None
) -> list[WalletTransaction]:
    """Get wallet transactions with optional filters."""
    query = select(WalletTransaction)
    
    if wallet_id:
        query = query.where(WalletTransaction.wallet_id == wallet_id)
    elif user_id:
        # Get wallet for user and filter by wallet_id
        wallet = get_wallet_by_user_id(db, user_id)
        if wallet:
            query = query.where(WalletTransaction.wallet_id == wallet.id)
        else:
            return []
    
    query = query.order_by(WalletTransaction.created_at.desc())
    
    if limit:
        query = query.limit(limit)
    
    return db.exec(query).all()


def get_wallet_with_transactions(
    db: Session,
    user_id: uuid.UUID,
    limit: Optional[int] = None
) -> Optional[Wallet]:
    """Get wallet with recent transactions."""
    wallet = get_wallet_by_user_id(db, user_id)
    if not wallet:
        return None
    
    # Get transactions
    transactions = get_wallet_transactions(db, wallet_id=wallet.id, limit=limit)
    wallet.transactions = transactions
    
    return wallet

