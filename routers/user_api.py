import os   # 從環境變量取得訊息
from typing import Annotated
from datetime import datetime, timedelta, timezone
from jose import jwt
from jwt import PyJWTError
from passlib.context import CryptContext
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from mysql.connector import Error
import mysql.connector.pooling


# 憑證Token(使用JWT)驗證功能
SECRET_KEY = os.environ.get('SECRET_KEY', '')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7    # 效期 值固定->宣告全域
oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/user/auth')     # 處理前端request 
# 密碼hash功能
password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


router = APIRouter(tags=['User'])


# 撰序: 註冊-->登入->儲存前端會取得從JWT Token解析的當前登入用戶的部分or全部狀態信息
class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class SignupSuccessResponse(BaseModel):
    ok: bool


class SigninRequest(BaseModel):
    email: str
    password: str


class SigninTokenResponse(BaseModel):
    token: str


class ErrorResponse(BaseModel):
    error: bool
    message: str


class SignedInUserResponse(BaseModel):
    id: int
    name: str
    email: str


# 撰序:先建資料庫&表格->再連接登入MySQL
def create_database_and_table():
    db = mysql.connector.connect(
        host="localhost",
        user="root",
        password=os.environ.get("DB_PASSWORD")
    )
    cursor = db.cursor()
    cursor.execute("CREATE DATABASE IF NOT EXISTS user")
    cursor.execute("USE user")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS member (
            id BIGINT AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(500) NOT NULL,
            PRIMARY KEY (id)
        );
    """)
    cursor.close()
    db.close()


def create_pool():
    dbconfig = {
        "host": "localhost",
        "user": "root",
        "password": os.environ.get("DB_PASSWORD"),
        "database": "user"
    }
    connection_pool = mysql.connector.pooling.MySQLConnectionPool(
        pool_name="mypool",
        pool_size=6,
        **dbconfig
    )
    return connection_pool


create_database_and_table()  # 記得呼叫才會執行
pool = create_pool()         # 應用程式啟動立即初始化連接池->建立1次，供不同API建立時多次呼叫


def get_db_connection():
    return pool.get_connection()


# 把建立token定義獨立函式，讓端點函式呼叫即可
def create_access_token(member_id: int, email: str, name: str, expires_delta: timedelta = timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)):
    token_data = {"sub": email, "id": member_id, "name": name}
    expire = datetime.now(timezone.utc) + expires_delta
    token_data.update({"exp": expire})
    encoded_jwt = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# 處理表單註冊API
@router.post('/api/user', responses={200: {"model": SignupSuccessResponse}, 400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}})
async def signup(request: SignupRequest):
    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor()

        db_cursor.execute("SELECT email FROM member WHERE email = %s", (request.email,))
        if db_cursor.fetchone() is not None:
            return JSONResponse(
                status_code=400,
                content={"error": True, "message": "Email已經註冊帳戶"}
            )
        # 註冊成功: 對資料庫:先hash密碼->插入所有資料->提交  -->返回成功回應
        password_hashed = password_context.hash(request.password)
        db_cursor.execute(
            "INSERT INTO member (name, email, password) VALUES (%s, %s, %s)",
            (request.name, request.email, password_hashed)
        )
        connection.commit()

        return JSONResponse(
            status_code=200,
            content={"ok": True}
        )
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


# 處理表單登入驗證API
@router.put('/api/user/auth', responses={200: {"model": SigninTokenResponse}, 400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}})
async def signin(signin_request: SigninRequest):
    db_cursor = None
    connection = None
    try:
        connection = get_db_connection()
        db_cursor = connection.cursor()

        db_cursor.execute("SELECT id, name, password FROM member WHERE email = %s", (signin_request.email,))
        user_record = db_cursor.fetchone()
        # 形式有此email用戶 且 實質 hashed密碼均對比符合 #索引來自查詢結果，非表格原始欄位順序
        if user_record and password_context.verify(signin_request.password, user_record[2]):
            member_id, member_name = user_record[0], user_record[1]
            encoded_token = create_access_token(member_id=member_id, email=signin_request.email, name=member_name, expires_delta=timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS))

            return JSONResponse(
                status_code=200,
                content={"token": encoded_token}
            )
        else:
            return JSONResponse(
                status_code=400,
                content={"error": True, "message": "電子郵件或密碼錯誤"}
            )
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


# 處理登入token驗證API
@router.get('/api/user/auth', response_model=SignedInUserResponse, status_code=status.HTTP_200_OK)
async def get_user_info(token: Annotated[str, Depends(oauth2_scheme)]):
    if not token or '.' not in token:
        raise HTTPException(status_code=401, detail="無效的 token 格式")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="無法驗證token,拒絕授權。")

        db_cursor = None
        connection = None
        try:
            connection = get_db_connection()
            db_cursor = connection.cursor()

            db_cursor.execute("SELECT id, name, email FROM member WHERE email = %s", (email,))
            user_record = db_cursor.fetchone()
            if user_record is None:
                raise HTTPException(status_code=404, detail="資料庫找不到此用戶資料，拒絕授權。")
            return SignedInUserResponse(id=user_record[0], name=user_record[1], email=user_record[2])
        finally:
            if db_cursor:
                db_cursor.close()
            if connection:
                connection.close()
    except PyJWTError as e:
        raise HTTPException(status_code=401, detail="無法驗證或過期的無效token,拒絕授權。") from e
