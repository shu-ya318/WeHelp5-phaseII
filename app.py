from dotenv import load_dotenv  # 它檔僅需引入os
from fastapi import *
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from routers import attractions_mrts_router, user_router, booking_orders_router


# 設環境變量，處理env檔
load_dotenv('../.env')


app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")


# Static Pages (Never Modify Code in this Block)
@app.get("/", include_in_schema=False)
async def index(request: Request):
	return FileResponse("./static/index.html", media_type="text/html")
@app.get("/attraction/{id}", include_in_schema=False)
async def attraction(request: Request, id: int):
	return FileResponse("./static/attraction.html", media_type="text/html")
@app.get("/booking", include_in_schema=False)
async def booking(request: Request):
	return FileResponse("./static/booking.html", media_type="text/html")
@app.get("/thankyou", include_in_schema=False)
async def thankyou(request: Request):
	return FileResponse("./static/thankyou.html", media_type="text/html")


# 連接 子資料夾的路由(參數為_init_.py把檔名轉換過的router物件名)
app.include_router(attractions_mrts_router)
app.include_router(user_router)
app.include_router(booking_orders_router)
