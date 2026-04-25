from pydantic import BaseModel

class WishlistItem(BaseModel):
    product_id: str