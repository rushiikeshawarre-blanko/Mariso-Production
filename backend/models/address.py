from pydantic import BaseModel

class AddressCreate(BaseModel):
    name: str
    phone: str
    address: str
    city: str
    postal_code: str
    is_default: bool = False