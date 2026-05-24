from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============ MODELS ============

class LoginRequest(BaseModel):
    password: str

class SettingsUpdate(BaseModel):
    exchange_rate: Optional[float] = None

class WarehouseCreate(BaseModel):
    name: str
    location: Optional[str] = ""
    description: Optional[str] = ""

class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class ProductCreate(BaseModel):
    name: str
    code: Optional[str] = ""
    category_id: Optional[str] = ""
    warehouse_id: Optional[str] = ""
    price_usd: float = 0
    cost_usd: float = 0
    quantity: int = 0
    min_quantity: int = 0
    unit: Optional[str] = "قطعة"
    description: Optional[str] = ""

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    category_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    price_usd: Optional[float] = None
    cost_usd: Optional[float] = None
    quantity: Optional[int] = None
    min_quantity: Optional[int] = None
    unit: Optional[str] = None
    description: Optional[str] = None

class InvoiceItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    price_usd: float
    total_usd: float

class InvoiceCreate(BaseModel):
    customer_name: Optional[str] = ""
    customer_phone: Optional[str] = ""
    items: List[InvoiceItem] = []
    discount: float = 0
    notes: Optional[str] = ""
    status: Optional[str] = "draft"

class InvoiceUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    items: Optional[List[InvoiceItem]] = None
    discount: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class DistributorCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""

class DistributorUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class TransactionCreate(BaseModel):
    distributor_id: str
    type: str  # "purchase" or "payment"
    amount_usd: float
    description: Optional[str] = ""
    invoice_number: Optional[str] = ""

class TransactionUpdate(BaseModel):
    type: Optional[str] = None
    amount_usd: Optional[float] = None
    description: Optional[str] = None
    invoice_number: Optional[str] = None


# ============ AUTH HELPERS ============

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_token(data: dict, expires_delta: timedelta) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + expires_delta}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="غير مصرح")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="انتهت صلاحية الجلسة")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="رمز غير صالح")


# ============ AUTH ROUTES ============

@api_router.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    settings = await db.settings.find_one({"type": "app_settings"}, {"_id": 0})
    if not settings:
        raise HTTPException(status_code=500, detail="لم يتم إعداد النظام بعد")
    if not verify_password(req.password, settings["password_hash"]):
        raise HTTPException(status_code=401, detail="كلمة المرور غير صحيحة")
    token = create_token({"role": "admin"}, timedelta(days=7))
    response.set_cookie(key="access_token", value=token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"token": token, "message": "تم تسجيل الدخول بنجاح"}

@api_router.get("/auth/verify")
async def verify_auth(request: Request):
    user = await get_current_user(request)
    return {"authenticated": True, "user": user}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"message": "تم تسجيل الخروج"}

@api_router.post("/auth/change-password")
async def change_password(request: Request):
    await get_current_user(request)
    body = await request.json()
    old_password = body.get("old_password", "")
    new_password = body.get("new_password", "")
    settings = await db.settings.find_one({"type": "app_settings"}, {"_id": 0})
    if not verify_password(old_password, settings["password_hash"]):
        raise HTTPException(status_code=400, detail="كلمة المرور القديمة غير صحيحة")
    new_hash = hash_password(new_password)
    await db.settings.update_one({"type": "app_settings"}, {"$set": {"password_hash": new_hash}})
    return {"message": "تم تغيير كلمة المرور بنجاح"}


# ============ SETTINGS ROUTES ============

@api_router.get("/settings")
async def get_settings(request: Request):
    await get_current_user(request)
    settings = await db.settings.find_one({"type": "app_settings"}, {"_id": 0, "password_hash": 0})
    if not settings:
        return {"exchange_rate": 0, "type": "app_settings"}
    settings.pop("password_hash", None)
    return settings

@api_router.put("/settings")
async def update_settings(req: SettingsUpdate, request: Request):
    await get_current_user(request)
    update_data = {}
    if req.exchange_rate is not None:
        update_data["exchange_rate"] = req.exchange_rate
    if update_data:
        await db.settings.update_one({"type": "app_settings"}, {"$set": update_data})
    settings = await db.settings.find_one({"type": "app_settings"}, {"_id": 0, "password_hash": 0})
    return settings


# ============ WAREHOUSE ROUTES ============

@api_router.get("/warehouses")
async def get_warehouses(request: Request):
    await get_current_user(request)
    warehouses = await db.warehouses.find({}, {"_id": 0}).to_list(1000)
    return warehouses

@api_router.post("/warehouses")
async def create_warehouse(req: WarehouseCreate, request: Request):
    await get_current_user(request)
    doc = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "location": req.location,
        "description": req.description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.warehouses.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/warehouses/{warehouse_id}")
async def update_warehouse(warehouse_id: str, req: WarehouseUpdate, request: Request):
    await get_current_user(request)
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if update_data:
        await db.warehouses.update_one({"id": warehouse_id}, {"$set": update_data})
    warehouse = await db.warehouses.find_one({"id": warehouse_id}, {"_id": 0})
    if not warehouse:
        raise HTTPException(status_code=404, detail="المستودع غير موجود")
    return warehouse

@api_router.delete("/warehouses/{warehouse_id}")
async def delete_warehouse(warehouse_id: str, request: Request):
    await get_current_user(request)
    result = await db.warehouses.delete_one({"id": warehouse_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المستودع غير موجود")
    return {"message": "تم حذف المستودع"}


# ============ CATEGORY ROUTES ============

@api_router.get("/categories")
async def get_categories(request: Request):
    await get_current_user(request)
    categories = await db.categories.find({}, {"_id": 0}).to_list(1000)
    return categories

@api_router.post("/categories")
async def create_category(req: CategoryCreate, request: Request):
    await get_current_user(request)
    doc = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "description": req.description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/categories/{category_id}")
async def update_category(category_id: str, req: CategoryUpdate, request: Request):
    await get_current_user(request)
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if update_data:
        await db.categories.update_one({"id": category_id}, {"$set": update_data})
    cat = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="الصنف غير موجود")
    return cat

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, request: Request):
    await get_current_user(request)
    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الصنف غير موجود")
    return {"message": "تم حذف الصنف"}


# ============ PRODUCT ROUTES ============

@api_router.get("/products")
async def get_products(
    request: Request,
    warehouse_id: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    low_stock: Optional[bool] = Query(None)
):
    await get_current_user(request)
    query = {}
    if warehouse_id:
        query["warehouse_id"] = warehouse_id
    if category_id:
        query["category_id"] = category_id
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"code": {"$regex": search, "$options": "i"}}
        ]
    products = await db.products.find(query, {"_id": 0}).to_list(10000)
    if low_stock:
        products = [p for p in products if p.get("quantity", 0) <= p.get("min_quantity", 0)]
    return products

@api_router.post("/products")
async def create_product(req: ProductCreate, request: Request):
    await get_current_user(request)
    doc = {
        "id": str(uuid.uuid4()),
        **req.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, req: ProductUpdate, request: Request):
    await get_current_user(request)
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if update_data:
        await db.products.update_one({"id": product_id}, {"$set": update_data})
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    return product

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, request: Request):
    await get_current_user(request)
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    return {"message": "تم حذف المنتج"}


# ============ INVOICE ROUTES ============

@api_router.get("/invoices")
async def get_invoices(
    request: Request,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    await get_current_user(request)
    query = {}
    if status:
        query["status"] = status
    if date_from or date_to:
        date_q = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to + "T23:59:59"
        query["created_at"] = date_q
    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return invoices

@api_router.post("/invoices")
async def create_invoice(req: InvoiceCreate, request: Request):
    await get_current_user(request)
    # Generate invoice number
    count = await db.invoices.count_documents({})
    invoice_number = f"INV-{count + 1:05d}"
    
    subtotal = sum(item.total_usd for item in req.items)
    total_usd = subtotal - req.discount

    # Get exchange rate
    settings = await db.settings.find_one({"type": "app_settings"}, {"_id": 0})
    exchange_rate = settings.get("exchange_rate", 0) if settings else 0

    doc = {
        "id": str(uuid.uuid4()),
        "invoice_number": invoice_number,
        "customer_name": req.customer_name,
        "customer_phone": req.customer_phone,
        "items": [item.model_dump() for item in req.items],
        "subtotal_usd": subtotal,
        "discount": req.discount,
        "total_usd": total_usd,
        "total_syp": total_usd * exchange_rate,
        "exchange_rate": exchange_rate,
        "notes": req.notes,
        "status": req.status,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.invoices.insert_one(doc)
    doc.pop("_id", None)

    # Deduct stock if completed
    if req.status == "completed":
        for item in req.items:
            await db.products.update_one(
                {"id": item.product_id},
                {"$inc": {"quantity": -item.quantity}}
            )

    return doc

@api_router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, req: InvoiceUpdate, request: Request):
    await get_current_user(request)
    old_invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not old_invoice:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")

    update_data = {}
    if req.customer_name is not None:
        update_data["customer_name"] = req.customer_name
    if req.customer_phone is not None:
        update_data["customer_phone"] = req.customer_phone
    if req.notes is not None:
        update_data["notes"] = req.notes
    if req.discount is not None:
        update_data["discount"] = req.discount
    if req.items is not None:
        update_data["items"] = [item.model_dump() for item in req.items]
        subtotal = sum(item.total_usd for item in req.items)
        discount = req.discount if req.discount is not None else old_invoice.get("discount", 0)
        update_data["subtotal_usd"] = subtotal
        update_data["total_usd"] = subtotal - discount

        settings = await db.settings.find_one({"type": "app_settings"}, {"_id": 0})
        exchange_rate = settings.get("exchange_rate", 0) if settings else 0
        update_data["total_syp"] = update_data["total_usd"] * exchange_rate
        update_data["exchange_rate"] = exchange_rate

    if req.status is not None:
        update_data["status"] = req.status
        # If completing, deduct stock
        if req.status == "completed" and old_invoice.get("status") != "completed":
            items = req.items if req.items else [InvoiceItem(**i) for i in old_invoice.get("items", [])]
            for item in items:
                if isinstance(item, dict):
                    item = InvoiceItem(**item)
                await db.products.update_one(
                    {"id": item.product_id},
                    {"$inc": {"quantity": -item.quantity}}
                )

    if update_data:
        await db.invoices.update_one({"id": invoice_id}, {"$set": update_data})

    invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    return invoice

@api_router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, request: Request):
    await get_current_user(request)
    result = await db.invoices.delete_one({"id": invoice_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    return {"message": "تم حذف الفاتورة"}


# ============ DISTRIBUTOR ROUTES ============

@api_router.get("/distributors")
async def get_distributors(request: Request):
    await get_current_user(request)
    distributors = await db.distributors.find({}, {"_id": 0}).to_list(1000)
    # Enrich with balance
    for d in distributors:
        txns = await db.distributor_transactions.find({"distributor_id": d["id"]}, {"_id": 0}).to_list(10000)
        purchases = sum(t["amount_usd"] for t in txns if t.get("type") == "purchase")
        payments = sum(t["amount_usd"] for t in txns if t.get("type") == "payment")
        d["balance_usd"] = purchases - payments
        d["total_purchases"] = purchases
        d["total_payments"] = payments
    return distributors

@api_router.post("/distributors")
async def create_distributor(req: DistributorCreate, request: Request):
    await get_current_user(request)
    doc = {
        "id": str(uuid.uuid4()),
        **req.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.distributors.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/distributors/{distributor_id}")
async def update_distributor(distributor_id: str, req: DistributorUpdate, request: Request):
    await get_current_user(request)
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if update_data:
        await db.distributors.update_one({"id": distributor_id}, {"$set": update_data})
    dist = await db.distributors.find_one({"id": distributor_id}, {"_id": 0})
    if not dist:
        raise HTTPException(status_code=404, detail="الموزع غير موجود")
    return dist

@api_router.delete("/distributors/{distributor_id}")
async def delete_distributor(distributor_id: str, request: Request):
    await get_current_user(request)
    result = await db.distributors.delete_one({"id": distributor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الموزع غير موجود")
    # Also delete transactions
    await db.distributor_transactions.delete_many({"distributor_id": distributor_id})
    return {"message": "تم حذف الموزع"}


# ============ DISTRIBUTOR TRANSACTION ROUTES ============

@api_router.get("/distributor-transactions")
async def get_transactions(
    request: Request,
    distributor_id: Optional[str] = Query(None)
):
    await get_current_user(request)
    query = {}
    if distributor_id:
        query["distributor_id"] = distributor_id
    txns = await db.distributor_transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return txns

@api_router.post("/distributor-transactions")
async def create_transaction(req: TransactionCreate, request: Request):
    await get_current_user(request)
    doc = {
        "id": str(uuid.uuid4()),
        **req.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.distributor_transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/distributor-transactions/{transaction_id}")
async def update_transaction(transaction_id: str, req: TransactionUpdate, request: Request):
    await get_current_user(request)
    update_data = {k: v for k, v in req.model_dump().items() if v is not None}
    if update_data:
        await db.distributor_transactions.update_one({"id": transaction_id}, {"$set": update_data})
    txn = await db.distributor_transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="المعاملة غير موجودة")
    return txn

@api_router.delete("/distributor-transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, request: Request):
    await get_current_user(request)
    result = await db.distributor_transactions.delete_one({"id": transaction_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="المعاملة غير موجودة")
    return {"message": "تم حذف المعاملة"}


# ============ DASHBOARD STATS ============

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(request: Request):
    await get_current_user(request)
    
    total_products = await db.products.count_documents({})
    total_warehouses = await db.warehouses.count_documents({})
    total_categories = await db.categories.count_documents({})
    total_distributors = await db.distributors.count_documents({})
    
    # Today's invoices
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_invoices = await db.invoices.find(
        {"created_at": {"$gte": today}, "status": "completed"},
        {"_id": 0}
    ).to_list(10000)
    today_sales = sum(inv.get("total_usd", 0) for inv in today_invoices)
    
    # Total invoices
    total_invoices = await db.invoices.count_documents({"status": "completed"})
    all_completed = await db.invoices.find({"status": "completed"}, {"_id": 0, "total_usd": 1}).to_list(100000)
    total_sales = sum(inv.get("total_usd", 0) for inv in all_completed)
    
    # Low stock products
    products = await db.products.find({}, {"_id": 0}).to_list(10000)
    low_stock_count = sum(1 for p in products if p.get("quantity", 0) <= p.get("min_quantity", 0))
    
    # Inventory value
    inventory_value = sum(p.get("price_usd", 0) * p.get("quantity", 0) for p in products)

    # Recent invoices
    recent_invoices = await db.invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)

    return {
        "total_products": total_products,
        "total_warehouses": total_warehouses,
        "total_categories": total_categories,
        "total_distributors": total_distributors,
        "today_sales": today_sales,
        "today_invoices_count": len(today_invoices),
        "total_invoices": total_invoices,
        "total_sales": total_sales,
        "low_stock_count": low_stock_count,
        "inventory_value": inventory_value,
        "recent_invoices": recent_invoices
    }


# ============ STARTUP ============

@app.on_event("startup")
async def startup():
    # Seed default settings with password
    settings = await db.settings.find_one({"type": "app_settings"})
    if not settings:
        await db.settings.insert_one({
            "type": "app_settings",
            "exchange_rate": 14500,
            "password_hash": hash_password(ADMIN_PASSWORD)
        })
        logger.info("Default settings created with password")
    else:
        # Update password if changed
        if not verify_password(ADMIN_PASSWORD, settings.get("password_hash", "")):
            await db.settings.update_one(
                {"type": "app_settings"},
                {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}}
            )
            logger.info("Password updated from env")

    # Create indexes
    await db.warehouses.create_index("id", unique=True)
    await db.categories.create_index("id", unique=True)
    await db.products.create_index("id", unique=True)
    await db.products.create_index("warehouse_id")
    await db.products.create_index("category_id")
    await db.invoices.create_index("id", unique=True)
    await db.invoices.create_index("created_at")
    await db.distributors.create_index("id", unique=True)
    await db.distributor_transactions.create_index("id", unique=True)
    await db.distributor_transactions.create_index("distributor_id")
    
    logger.info("Database indexes created")

    # Write test credentials
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write(f"## Login\n")
        f.write(f"- Password: {ADMIN_PASSWORD}\n")
        f.write(f"- No email needed, just password\n\n")
        f.write(f"## Endpoints\n")
        f.write(f"- POST /api/auth/login (body: {{\"password\": \"{ADMIN_PASSWORD}\"}})\n")
        f.write(f"- GET /api/auth/verify\n")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
