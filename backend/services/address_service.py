from fastapi import HTTPException
from core.database import db
from models.address import AddressCreate
import uuid

async def get_addresses(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "addresses": 1})
    if not user:
        return []
    return user.get("addresses", [])


async def add_address(user_id: str, address: AddressCreate):
    address_id = str(uuid.uuid4())
    address_doc = {
        "id": address_id,
        **address.model_dump()
    }

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "addresses": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if address.is_default and user.get("addresses"):
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"addresses.$[].is_default": False}}
        )

    result = await db.users.update_one(
        {"id": user_id},
        {"$push": {"addresses": address_doc}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return address_doc

async def delete_address(user_id: str, address_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "addresses": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    addresses = user.get("addresses", [])
    if not any(address.get("id") == address_id for address in addresses):
        raise HTTPException(status_code=404, detail="Address not found")

    await db.users.update_one(
        {"id": user_id},
        {"$pull": {"addresses": {"id": address_id}}}
    )
    return {"message": "Address deleted"}