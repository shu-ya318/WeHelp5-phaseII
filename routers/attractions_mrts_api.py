from fastapi import APIRouter, Query, HTTPException, status
from fastapi.responses import JSONResponse
from typing import Optional, List
from pydantic import BaseModel
from mysql.connector import Error
import mysql.connector.pooling
import os


# 先載入模組、替代app = FastAPI(  )
router = APIRouter(tags=["Attraction_and_mrt"])


#  定義 API 的請求、回應的資料結構，便於前端處理
class Attraction(BaseModel):
    id: int
    name: str
    category: str
    description: str
    address: str
    transport: str
    mrt: Optional[str] = None
    lat: float
    lng: float
    images: List[str]


class MRT(BaseModel):
    data: List[str]


class AttractionResponse(BaseModel):
    nextPage: Optional[int] = None
    data: List[Attraction]


class AttractionByIdResponse(BaseModel):
    data: Attraction


class ErrorResponse(BaseModel):
    error: bool
    message: str


def create_pool():
    dbconfig = {
        "host": "localhost",
        "user": "root",
        "password": os.getenv("DB_PASSWORD"),
        "database": "taipeiattractions"
    }
    connection_pool = mysql.connector.pooling.MySQLConnectionPool(
        pool_name="mypool",
        pool_size=6,
        **dbconfig
    )
    return connection_pool


def get_db_connection(pool):
    return pool.get_connection()


@router.get("/api/attractions", response_model=AttractionResponse, status_code=status.HTTP_200_OK)
async def query_attractions(page: int = Query(0, ge=0), keyword: Optional[str] = None):   # 參數不寫match_mrt預設布林值，否則網址額外多輸入&match_mrt=True才能找到
    db_cursor = None
    connection = None
    try:
        pool = create_pool()
        connection = get_db_connection(pool)
    except Error as e:
        error_message = "Database connection error: {}".format(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_message
        ) from e

    try:
        db_cursor = connection.cursor(dictionary=True)
        page_size = 12
        offset = page * page_size
        base_query = "SELECT id, name, category, description, address, transport, mrt, lat, lng, images FROM attractions"
        where_clause = ""
        params = []

        if keyword and keyword.strip():                             # 檢查 keyword 是否存在且非空白字串 (滿足條件: 不給定 =不篩選、顯示所有資料)
            keyword = keyword.strip()                               # 過濾 關鍵字兩側空白字串
            where_clause = " WHERE name LIKE %s OR TRIM(mrt) = %s"  # 滿足其一: 模糊匹配景點名稱 或 完全匹配捷運站名稱，且先過濾空白
            params = [f"%{keyword}%", keyword]

        query = f"{base_query}{where_clause} LIMIT %s OFFSET %s"
        full_params = params + [page_size, offset]

        db_cursor.execute(query, full_params)
        results = db_cursor.fetchall()

        # 處理下一頁
        next_page_query = f"{base_query}{where_clause} LIMIT 1 OFFSET %s"
        next_page_params = params + [offset + page_size]
        db_cursor.execute(next_page_query, next_page_params)
        next_page_exists = db_cursor.fetchone()
    except Error as e:
        error_message = "Database query error: {}".format(str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_message
        ) from e
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()

    # 須在創建 Attraction 模型前，處理 images 字段 (因接收型別為字串，整理轉換成列表)
    for result in results:
        if result["images"]:
            result["images"] = result["images"].split(",")
        else:
            result["images"] = []

    attractions = [Attraction(**result) for result in results]

    next_page = page + 1 if next_page_exists else None
    return AttractionResponse(nextPage=next_page, data=attractions)


@router.get("/api/attraction/{attractionId}", responses={200: {"model": AttractionByIdResponse}, 400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}})
async def get_attraction(attractionId: int):
    db_cursor = None
    connection = None
    try:
        pool = create_pool()
        connection = get_db_connection(pool)
        db_cursor = connection.cursor(dictionary=True)
        db_cursor.execute("SELECT * FROM attractions WHERE id = %s", (attractionId,))
        result = db_cursor.fetchone()

        if not result:
            return JSONResponse(
                status_code=400,
                content={"error": True, "message": "景點編號不正確"}  # 如:參數id輸入正整數但不存在 或0 或 負數
            )

        result["images"] = result["images"].split(",") if result["images"] else []

        attraction_data = Attraction(**result)
        return JSONResponse(
            status_code=200,
            content={"data": attraction_data.model_dump()}
        )
    except Error as e:
        return JSONResponse(
            status_code=500,
            content={"error": True, "message": str(e)}
        )    # return 不能加from e
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()


@router.get("/api/mrts", response_model=MRT, status_code=status.HTTP_200_OK)
async def get_mrts():
    db_cursor = None
    connection = None
    try:
        pool = create_pool()
        connection = get_db_connection(pool)
        db_cursor = connection.cursor(dictionary=True)
        db_cursor.execute("SELECT DISTINCT mrt FROM attractions WHERE mrt IS NOT NULL AND mrt != ''")        
        results = db_cursor.fetchall()
        mrt_stations = [result["mrt"] for result in results]
        return {"data": mrt_stations}
    except Error as e:
        return JSONResponse(
            status_code=500,
            content={"error": True, "message": str(e)}
        )
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()

# 開發階段用，生產環境不寫uvicorn.run
# if __name__ == "__main__":
#   import uvicorn
#   uvicorn.run(router, host="127.0.0.1", port=8000)
