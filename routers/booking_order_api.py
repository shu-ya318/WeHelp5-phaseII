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
import re
import random
import json
from httpx import AsyncClient

import traceback

SECRET_KEY = os.environ.get("SECRET_KEY", "")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/user/auth"
)  # 請求任何需授權api: 後端tokenUrl=驗證api、前端請求夾帶Bearer token


router = APIRouter(tags=["Booking_and_Order"])


# 預定
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


# 下訂
class TripInfo(BaseModel):
    attraction: AttractionInfo
    date: str
    time: str


class ContactInfo(BaseModel):
    name: str
    email: str
    phone: str


class OrderInfo(BaseModel):
    price: int
    trip: TripInfo
    contact: ContactInfo


class OrdersRequest(BaseModel):
    prime: str
    order: OrderInfo


class Payment(BaseModel):
    status: int
    message: str


class OrderPayment(BaseModel):
    number: str
    payment: Payment


class OrdersResponse(BaseModel):
    data: OrderPayment


class OrderByNumber(BaseModel):
    number: str
    price: int
    trip: TripInfo
    contact: ContactInfo
    status: int


class OrderByNumberResponse(BaseModel):
    data: OrderByNumber


class ErrorResponse(BaseModel):
    error: bool
    message: str


def create_reservations_table():
    db = mysql.connector.connect(
        host="localhost",
        user="root",
        password=os.environ.get("DB_PASSWORD"),
        database="taipei_trip",
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
    );
    """
    cursor.execute(create_table_query)
    cursor.close()
    db.close()


# 訂單紀錄表格(付款狀態，0未 1已 且mark預設0)
def create_orders_table():
    db = mysql.connector.connect(
        host="localhost",
        user="root",
        password=os.environ.get("DB_PASSWORD"),
        database="taipei_trip",
    )
    cursor = db.cursor()
    create_table_query = """
    CREATE TABLE IF NOT EXISTS orders (
        id BIGINT AUTO_INCREMENT,
        prime VARCHAR(255)  NOT NULL,
        number VARCHAR(255)  NOT NULL,
        reservation_id BIGINT  NOT NULL,
        attraction_id BIGINT  NOT NULL,
        user_id BIGINT  NOT NULL,
        name VARCHAR(255)  NOT NULL,
        email VARCHAR(255)  NOT NULL,
        phone VARCHAR(255)  NOT NULL,
        payment_status INT  DEFAULT -1,
        price INT NOT NULL,
        date  DATE   NOT NULL,
        time VARCHAR(10) NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (reservation_id) REFERENCES reservations(id),
        FOREIGN KEY (attraction_id) REFERENCES attractions(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
    """
    cursor.execute(create_table_query)
    cursor.close()
    db.close()


# 付款紀錄表格(付款交易狀態，0失敗 1成功)(付款成敗分開紀錄，不設not null)
def create_payment_table():
    db = mysql.connector.connect(
        host="localhost",
        user="root",
        password=os.environ.get("DB_PASSWORD"),
        database="taipei_trip",
    )
    cursor = db.cursor()
    create_table_query = """
    CREATE TABLE IF NOT EXISTS payment (
        id BIGINT AUTO_INCREMENT,
        order_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        transaction_status INT NOT NULL ,
        success_result VARCHAR(500) ,
        failure_result VARCHAR(500) ,
        PRIMARY KEY (id),
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
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
        "database": "taipei_trip",
    }
    connection_pool = mysql.connector.pooling.MySQLConnectionPool(
        pool_name="mypool", pool_size=6, **dbconfig
    )
    return connection_pool


create_reservations_table()
create_orders_table()
create_payment_table()
pool = create_pool()


def get_db_connection():
    return pool.get_connection()


def decode_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None  # 不逕拋出異常，改為呼叫各函式自定義


# post請求('/api/orders')使用的輔函
def create_order_number() -> str:  # 方:時間戳+隨機數
    timestamp = int(datetime.now().timestamp())
    random_number = random.randint(100, 999)
    order_number = f"1{timestamp % 10000000000:010d}{random_number:03d}"
    return order_number[:14]


def get_reservation_id(user_id: int):
    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor(dictionary=True)
        query = """
        SELECT id FROM reservations
        WHERE user_id = %s ORDER BY id DESC LIMIT 1
        """
        db_cursor.execute(query, (user_id,))
        result = db_cursor.fetchone()
        return result["id"] if result else None
    except Exception as e:
        print(f"Error fetching reservation id: {str(e)}")
        return None
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()


def get_reservation_price(user_id: int):
    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor(dictionary=True)
        query = """
        SELECT price FROM reservations
        WHERE user_id = %s ORDER BY id DESC LIMIT 1
        """
        db_cursor.execute(query, (user_id,))
        result = db_cursor.fetchone()
        return result["price"] if result else None
    except Exception as e:
        print(f"Error fetching reservation price: {str(e)}")
        return None
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()


# 需授權API:操作前先呼叫函式驗證token(->通過才進資料庫操作)
#   預定表單提交
@router.post(
    "/api/booking",
    responses={
        200: {"model": SuccessResponse},
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def create_booking(
    request: BookingRequest, token: Annotated[str, Depends(oauth2_scheme)]
):
    payload = decode_token(token)
    if not payload:
        return JSONResponse(
            content={"error": True, "message": "未登入系統，拒絕存取。"},
            status_code=403,
        )
    user_id = payload.get("id")

    #   由後端驗證表單: 序先於操作資料庫寫入值
    today = datetime.now().date()
    maxdate_allowed = today + timedelta(days=60)
    if request.date <= today or request.date > maxdate_allowed:
        return JSONResponse(
            content={"error": True, "message": "預定日期限於今日(不含)起未來2個月內。"},
            status_code=400,
        )

    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor()
        # 同user_id者，只存最新1筆: 檢查是否存在->若存在則更新/覆蓋、不存在，則首次插入
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
                (
                    request.attractionId,
                    request.date,
                    request.time,
                    request.price,
                    user_id,
                ),
            )
        else:
            insert_query = """
            INSERT INTO reservations (attraction_id, user_id,
                                      date, time, price)
            VALUES (%s, %s, %s, %s, %s)
            """
            db_cursor.execute(
                insert_query,
                (
                    request.attractionId,
                    user_id,
                    request.date,
                    request.time,
                    request.price,
                ),
            )
        connection.commit()

        return JSONResponse(content={"ok": True}, status_code=200)
    except Error:
        return JSONResponse(
            content={"error": True, "message": "INTERNAL_SERVER_ERROR"}, status_code=500
        )
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()


#   顯示預定行程
@router.get(
    "/api/booking",
    responses={
        200: {"model": AttractionBookingResponse},
        403: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def get_booking(token: Annotated[str, Depends(oauth2_scheme)]):
    payload = decode_token(token)
    if not payload:
        return JSONResponse(
            content={"error": True, "message": "未登入系統，拒絕存取。"},
            status_code=403,
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
        db_cursor.execute(query, (payload["id"],))
        reservation = db_cursor.fetchone()

        if reservation:
            # 額外處理URL
            image_url = (
                reservation["images"].split(",")[0]
                if "," in reservation["images"]
                else reservation["images"]
            )
            booking_info = AttractionBookingInfo(
                attraction=AttractionInfo(
                    id=reservation["attraction_id"],
                    name=reservation["name"],
                    address=reservation["address"],
                    image=image_url,
                ),
                date=reservation["date"].isoformat(),  # 轉換成符合格式
                time=reservation["time"],
                price=reservation["price"],
            )
            response_data = AttractionBookingResponse(data=booking_info)

            return JSONResponse(content=response_data.model_dump(), status_code=200)
    except Error:
        return JSONResponse(
            content={"error": True, "message": "INTERNAL_SERVER_ERROR"}, status_code=500
        )
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()


@router.delete(
    "/api/booking",
    responses={
        200: {"model": SuccessResponse},
        403: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def delete_booking(token: Annotated[str, Depends(oauth2_scheme)]):
    payload = decode_token(token)
    if not payload:
        return JSONResponse(
            content={"error": True, "message": "未登入系統，拒絕存取"}, status_code=403
        )

    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor()
        delete_query = "DELETE FROM reservations WHERE user_id = %s"
        db_cursor.execute(delete_query, (payload["id"],))
        connection.commit()

        return JSONResponse(content={"ok": True}, status_code=200)
    except Error:
        return JSONResponse(
            content={"error": True, "message": "INTERNAL_SERVER_ERROR"}, status_code=500
        )
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()


# 下訂
@router.post(
    "/api/orders",
    responses={
        200: {"model": OrdersResponse},
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def create_orders(
    request: OrdersRequest, token: Annotated[str, Depends(oauth2_scheme)]
):
    payload = decode_token(token)
    if not payload:
        return JSONResponse(
            content={"error": True, "message": "未登入系統，拒絕存取。"},
            status_code=403,
        )
    user_id = payload.get("id")

    if not re.search(r"^09\d{8}$", request.order.contact.phone):
        return JSONResponse(
            content={"error": True, "message": "手機號碼須為09開頭!"}, status_code=400
        )
    if not re.match(r"[^@]+@[^@]+\.[^@]+", request.order.contact.email):
        return JSONResponse(
            content={"error": True, "message": "email格式輸入錯誤!"}, status_code=400
        )

    # 排除完 身分驗證+輸入驗證失敗，再操作資料庫
    #      (1)依request+token建立欄位值
    #      (2)CALL TapPay by Prime API(request有必要資訊)
    #      (3)依Prime API的response，更新欄位值 + return對應JSONresponse
    db_cursor = None
    connection = None
    try:
        # 建立1次連線&遊標 ，關閉前 可執行任何SQL查詢、操作不同表格
        connection = get_db_connection()
        db_cursor = connection.cursor(dictionary=True)

        # 函式內任何操作、SQL查詢，均共用的變數名 1.儲額外函式操作取得值 2.取代過長的值
        number = create_order_number()
        reservation_id = get_reservation_id(user_id)
        price = get_reservation_price(user_id)
        request_trip = request.order.trip
        request_attraction = request.order.trip.attraction
        request_contact = request.order.contact

        insert_order_query = """
        INSERT INTO orders (prime,
                            number, reservation_id,
                            attraction_id, user_id,
                            name, email, phone,
                            payment_status,
                            price, date, time)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        db_cursor.execute(
            insert_order_query,
            (
                request.prime,
                number,
                reservation_id,
                request_attraction.id,
                user_id,
                request_contact.name,
                request_contact.email,
                request_contact.phone,
                -1,
                request.order.price,
                request_trip.date,
                request_trip.time,
            ),
        )
        connection.commit()
        order_id = db_cursor.lastrowid

        tappay_payload = {
            "prime": request.prime,
            "partner_key": os.environ.get("PARTNER_KEY"),
            "merchant_id": os.environ.get("MERCHANT_ID"),
            "details": "TapPay Test",
            "amount": price,
            "cardholder": {
                "phone_number": request_contact.phone,
                "name": request_contact.name,
                "email": request_contact.email,
                "member_id": user_id,
            },
            "remember": True,
        }
        async with AsyncClient() as client:
            response = await client.post(
                "https://sandbox.tappaysdk.com/tpc/payment/pay-by-prime",
                json=tappay_payload,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": os.environ["PARTNER_KEY"],  # 確保非none
                },
            )
            response_data = response.json()
            payment_status = (
                0
                if (response.status_code == 200 and response_data.get("status") == 0)
                else -1
            )
            payment_message = "付款成功" if payment_status == 0 else "付款失敗"

            # 先更新 訂單的支付狀態
            update_order_payment_status = """
            UPDATE orders SET payment_status = %s WHERE id = %s
            """
            db_cursor.execute(update_order_payment_status, (payment_status, order_id))
            connection.commit()
            # print("oeder表格的付款狀態欄位更新:", order_id, payment_status)

            # 再建立 付款交易的詳細資訊
            def serialize_relevant_data(response_data):
                relevant_data = {
                    "status": response_data.get("status"),
                    "msg": response_data.get("msg"),
                    "acquirer": response_data.get("acquirer"),
                    "rec_trade_id": response_data.get("rec_trade_id"),
                    "bank_transaction_id": response_data.get("bank_transaction_id"),
                }
                return json.dumps(relevant_data)

            success_data = (
                serialize_relevant_data(response_data)
                if payment_status == 0
                else "no happened"
            )
            failure_data = (
                "no happened"
                if payment_status == 0
                else serialize_relevant_data(response_data)
            )
            db_cursor.execute(
                """
                              SELECT id FROM orders WHERE id = %s
                              """,
                (order_id,),
            )  # 寫法:SQL查詢結束 , 參數
            order_check = db_cursor.fetchone()  # 每次查詢完都處理查詢結果
            if order_check is None:
                print("無對應的orders記錄,無法插入payment資料")

            insert_payment_query = """
            INSERT INTO payment (order_id, user_id,
                                transaction_status,
                                success_result, failure_result)
            VALUES (%s, %s, %s, %s, %s)
            """
            db_cursor.execute(
                insert_payment_query,
                (order_id, user_id, payment_status, success_data, failure_data),
            )
            connection.commit()

            # 暫關閉 外鍵檢查 (目的: 被外鍵約束的表格 能執行U或D操作)(QQ 建立時ON DELETE 相關指令,均500伺服器操作)
            db_cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
            connection.commit()
            # 訂單成立(不問付款成敗，也不寫if payment_status:)，刪預定資料 (序:等插入資料進payment完，否則無對應order_id)
            delete_reservation_query = "DELETE FROM reservations WHERE id = %s"
            db_cursor.execute(delete_reservation_query, (reservation_id,))
            connection.commit()
            # 重啟
            db_cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")
            connection.commit()

            order_payment_record = OrderPayment(
                number=number,
                payment=Payment(status=payment_status, message=payment_message),
            )
            order_response_data = OrdersResponse(data=order_payment_record)
            return JSONResponse(
                content=order_response_data.model_dump(), status_code=200
            )
    except Error:
        error_details = traceback.format_exc()
        print("Error details:", error_details)
        return JSONResponse(
            content={"error": True, "message": "INTERNAL_SERVER_ERROR"}, status_code=500
        )
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()


@router.get(
    "/api/order/{orderNumber}",
    responses={
        200: {"model": OrderByNumberResponse},
        403: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def get_order(orderNumber: str, token: Annotated[str, Depends(oauth2_scheme)]):
    payload = decode_token(token)
    if not payload:
        return JSONResponse(
            status_code=403,
            content={"error": True, "message": "未登入系統，拒絕存取。"},
        )

    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor(dictionary=True)
        # 選來自各表格欄名.從有外鍵表格  關聯不同表格.匹對:訂單id (x)user id，因同會員恐多訂單
        #  不能用reservation_id匹對，因訂單成立即刪預定資料
        query = """
        SELECT o.id AS order_id, o.number, o.price,
               a.id AS attraction_id, a.name, a.address, a.images,
               o.date, o.time,
               o.name AS orderer_name,
               o.email, o.phone,
               o.payment_status
        FROM orders o
        JOIN attractions a ON o.attraction_id = a.id
        WHERE o.number = %s
        """
        db_cursor.execute(query, (orderNumber,))  # 參數要加,  -> 建立僅1元素的元組
        order = db_cursor.fetchone()

        if order is None:
            return JSONResponse(
                status_code=404,
                content={"error": True, "message": "找不到該訂單號碼對應資料"},
            )

        # 使用數據模型形式+巢狀屬性->分開用變數名儲值，再併
        if order:
            image_url = (
                order["images"].split(",")[0]
                if "," in order["images"]
                else order["images"]
            )
            attraction_info = AttractionInfo(
                id=order["attraction_id"],
                name=order["name"],
                address=order["address"],
                image=image_url,
            )
            trip_info = TripInfo(
                attraction=attraction_info,
                date=order["date"].isoformat(),
                time=order["time"],
            )
            contact_info = ContactInfo(
                name=order["orderer_name"], email=order["email"], phone=order["phone"]
            )
            order_info = OrderByNumber(
                number=order["number"],
                price=order["price"],
                trip=trip_info,
                contact=contact_info,
                status=order["payment_status"],
            )
            response_data = OrderByNumberResponse(data=order_info)
            return JSONResponse(content=response_data.model_dump(), status_code=200)
    except Error:
        error_details = traceback.format_exc()
        print("Error details:", error_details)
        return JSONResponse(
            content={"error": True, "message": "INTERNAL_SERVER_ERROR"}, status_code=500
        )
    finally:
        if db_cursor:
            db_cursor.close()
        if connection:
            connection.close()
