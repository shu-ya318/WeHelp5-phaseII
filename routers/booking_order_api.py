import os

from typing import Annotated
from jose import jwt, JWTError
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from datetime import date, datetime, timedelta
from mysql.connector import Error
import mysql.connector.pooling


SECRET_KEY = os.environ.get('SECRET_KEY', '')
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/user/auth')     # 請求任何需授權api: 後端tokenUrl=驗證api、前端請求夾帶Bearer token


router = APIRouter(tags=['Booking_and_Order'])


class BookingRequest(BaseModel):
    attractionId: int
    date: date
    time: str
    price: int


class AttractionInfo(BaseModel):
    id: int
    name: str
    address: str
    image: str


class AttractionBookingInfo(BaseModel):
    attraction: AttractionInfo
    date: str
    time: str
    price: int


class AttractionBookingResponse(BaseModel):
    data: AttractionBookingInfo


class SuccessResponse(BaseModel):
    ok: bool


class ErrorResponse(BaseModel):
    error: bool
    message: str


def create_reservations_table():
    db = mysql.connector.connect(
        host="localhost",
        user="root",
        password=os.environ.get("DB_PASSWORD"),
        database="taipei_trip"
    )
    cursor = db.cursor()
    create_table_query = """
    CREATE TABLE IF NOT EXISTS reservations (
        id BIGINT AUTO_INCREMENT,
        attraction_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        date DATE NOT NULL,
        time VARCHAR(10) NOT NULL,
        price INT NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (attraction_id) REFERENCES attractions(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
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


create_reservations_table()
pool = create_pool()


def get_db_connection():
    return pool.get_connection()


def decode_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None     # 不逕拋出異常，改為呼叫各函式自定義


# 需授權API:操作前先呼叫函式驗證token(->通過才進資料庫操作)
#   預定表單提交
@router.post('/api/booking', responses={
            200: {"model": SuccessResponse},
            400: {"model": ErrorResponse},
            403: {"model": ErrorResponse},
            500: {"model": ErrorResponse}
            })
async def create_booking(request: BookingRequest,
                         token: Annotated[str, Depends(oauth2_scheme)]):
    payload = decode_token(token)
    if not payload:
        return JSONResponse(
            content={"error": True, "message": "未登入系統，拒絕存取。"},
            status_code=403
        )
    user_id = payload.get('id')

    #   由後端驗證表單: 序先於操作資料庫寫入值
    today = datetime.now().date()
    maxdate_allowed = today + timedelta(days=60)
    if request.date <= today or request.date > maxdate_allowed:
        return JSONResponse(
            content={"error": True, "message": "預定日期限於今日(不含)起未來2個月內。"},
            status_code=400
        )

    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor()
        # 同user_id者只存最新1筆: 檢查是否存在->若存在則更新/覆蓋、不存在，則首次插入
        check_query = "SELECT id FROM reservations WHERE user_id = %s"
        db_cursor.execute(check_query, (user_id,))
        existing_reservation = db_cursor.fetchone()
        if existing_reservation:
            update_query = """
            UPDATE reservations
            SET attraction_id = %s, date = %s, time = %s, price = %s
            WHERE user_id = %s
            """
            db_cursor.execute(
                update_query,
                (request.attractionId, request.date,
                 request.time, request.price, user_id)
            )
        else:
            insert_query = """
            INSERT INTO reservations (attraction_id, user_id,
                                      date, time, price)
            VALUES (%s, %s, %s, %s, %s)
            """
            db_cursor.execute(
                insert_query,
                (request.attractionId, user_id,
                 request.date, request.time, request.price)
            )
        connection.commit()

        return JSONResponse(
                content={"ok": True},
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


#   顯示預定行程
@router.get('/api/booking', responses={
            200: {"model": AttractionBookingResponse},
            403: {"model": ErrorResponse},
            500: {"model": ErrorResponse}
            })
async def get_booking(token: Annotated[str, Depends(oauth2_scheme)]):
    payload = decode_token(token)
    if not payload:
        return JSONResponse(
            content={"error": True, "message": "未登入系統，拒絕存取。"},
            status_code=403
        )

    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor(dictionary=True)
        #  關聯2表格，利用id對比、查詢時使用別名  # 加寫LIMIT 1 :查詢僅返回首筆紀錄
        query = """
        SELECT r.attraction_id, a.name, a.address, a.images,
               r.date, r.time, r.price
        FROM reservations r
        JOIN attractions a ON r.attraction_id = a.id
        WHERE r.user_id = %s LIMIT 1
        """
        db_cursor.execute(query, (payload['id'],))
        reservation = db_cursor.fetchone()

        if reservation:
            # 額外處理URL
            image_url = (
                reservation['images'].split(',')[0]
                if ',' in reservation['images']
                else reservation['images']
            )
            booking_info = AttractionBookingInfo(
                attraction=AttractionInfo(
                    id=reservation['attraction_id'],
                    name=reservation['name'],
                    address=reservation['address'],
                    image=image_url
                ),
                date=reservation['date'].isoformat(),  # 轉換成符合格式
                time=reservation['time'],
                price=reservation['price']
            )
            response_data = AttractionBookingResponse(data=booking_info)

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


@router.delete('/api/booking', responses={
                200: {"model": SuccessResponse},
                403: {"model": ErrorResponse},
                500: {"model": ErrorResponse}
                })
async def delete_booking(token: Annotated[str, Depends(oauth2_scheme)]):
    payload = decode_token(token)
    if not payload:
        return JSONResponse(
            content={"error": True, "message": "未登入系統，拒絕存取"},
            status_code=403
        )

    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor()
        delete_query = "DELETE FROM reservations WHERE user_id = %s"
        db_cursor.execute(delete_query, (payload['id'],))
        connection.commit()

        return JSONResponse(
            content={"ok": True},
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
