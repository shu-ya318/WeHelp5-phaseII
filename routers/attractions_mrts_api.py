import os

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
from mysql.connector import Error
import mysql.connector.pooling


# 先載入模組、替代app = FastAPI(  )
router = APIRouter(tags=['Attraction_and_Mrt'])


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


class AttractionResponse(BaseModel):
    nextPage: Optional[int] = None
    data: List[Attraction]


class AttractionByIdResponse(BaseModel):
    data: Attraction


class MRT(BaseModel):
    data: List[str]


class ErrorResponse(BaseModel):
    error: bool
    message: str


def create_database_and_table():
    db = mysql.connector.connect(
        host="localhost",
        user="root",
        password=os.environ.get("DB_PASSWORD")
    )
    cursor = db.cursor()
    cursor.execute("CREATE DATABASE IF NOT EXISTS taipei_trip")
    cursor.execute("USE taipei_trip")
    create_table_query = """
    CREATE TABLE IF NOT EXISTS attractions (
        id BIGINT AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL  UNIQUE,
        category VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        address VARCHAR(255) NOT NULL,
        transport TEXT NOT NULL,
        mrt VARCHAR(100),
        lat DECIMAL(10,8) NOT NULL,
        lng DECIMAL(11,8) NOT NULL,
        images TEXT NOT NULL,
        PRIMARY KEY (id)
    );
    """
    cursor.execute(create_table_query)
    cursor.close()
    db.close()


def create_pool():
    dbconfig = {
        "host": "localhost",
        "user": "root",
        "password": os.environ.get("DB_PASSWORD"),
        "database": "taipei_trip"
    }
    connection_pool = mysql.connector.pooling.MySQLConnectionPool(
        pool_name="mypool",
        pool_size=6,
        **dbconfig
    )
    return connection_pool


create_database_and_table()
pool = create_pool()


def get_db_connection():
    return pool.get_connection()


@router.get('/api/attractions', responses={
            200: {"model": AttractionResponse},
            500: {"model": ErrorResponse}
            })
async def query_attractions(page: int = Query(0, ge=0),
                            keyword: Optional[str] = None
                            ):  # 參數(x)match_mrt預設布林值，否則網址多輸入&match_mrt=True
    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor(dictionary=True)
    except Error:
        return JSONResponse(
            status_code=500,
            content={"error": True,
                     "message": "INTERNAL_SERVER_ERROR"}
        )

    try:
        db_cursor = connection.cursor(dictionary=True)
        page_size = 12
        offset = page * page_size
        base_query = ("""
            SELECT id, name, category, description, address, transport, mrt,
            lat, lng, images
            FROM attractions
        """)
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

        # 處理下頁
        next_page_query = f"{base_query}{where_clause} LIMIT 1 OFFSET %s"
        next_page_params = params + [offset + page_size]
        db_cursor.execute(next_page_query, next_page_params)
        next_page_exists = db_cursor.fetchone()
    except Error:
        return JSONResponse(
            status_code=500,
            content={"error": True,
                     "message": "INTERNAL_SERVER_ERROR"}
        )
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

    response_data = AttractionResponse(nextPage=next_page, data=attractions)
    return JSONResponse(
        content=response_data.model_dump(),
        status_code=200
    )


@router.get('/api/attraction/{attractionId}', responses={
            200: {"model": AttractionByIdResponse},
            400: {"model": ErrorResponse},
            500: {"model": ErrorResponse}
            })
async def get_attraction(attractionId: int):
    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor(dictionary=True)
        db_cursor.execute(
            "SELECT * FROM attractions WHERE id = %s", (attractionId,)
        )
        result = db_cursor.fetchone()

        if not result:
            return JSONResponse(
                content={"error": True, "message": "景點編號錯誤"},
                status_code=400,
            )

        result["images"] = (
            result["images"].split(",") if result["images"] else []
        )

        response_data = AttractionByIdResponse(data=Attraction(**result))
        return JSONResponse(
            content=response_data.model_dump(),
            status_code=200
        )
    except Error:
        return JSONResponse(
            content={"error": True,
                     "message": "INTERNAL_SERVER_ERROR"},
            status_code=500
        )
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()


# 需分組捷運站，再統計每站景點數，最後由多到少排序
@router.get('/api/mrts', responses={
            200: {"model": MRT},
            500: {"model": ErrorResponse}
            })
async def get_mrts():
    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor(dictionary=True)
        db_cursor.execute("""
            SELECT mrt, COUNT(*) as count
            FROM attractions
            WHERE mrt IS NOT NULL AND mrt != ''
            GROUP BY mrt
            ORDER BY count DESC
        """)
        results = db_cursor.fetchall()
        mrt_stations = [result["mrt"] for result in results]

        response_data = MRT(data=mrt_stations)
        return JSONResponse(
            content=response_data.model_dump(),
            status_code=200
        )
    except Error:
        return JSONResponse(
            content={"error": True,
                     "message": "INTERNAL_SERVER_ERROR"},
            status_code=500
        )
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()
