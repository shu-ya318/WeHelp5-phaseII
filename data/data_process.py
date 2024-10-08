import json
import os
import mysql.connector


def create_pool():
    dbconfig = {
        "host": "localhost",
        "user": "root",
        "password": os.environ.get("DB_PASSWORD"),
        "database": "taipei_trip",
    }
    pool = mysql.connector.pooling.MySQLConnectionPool(
        pool_name="mypool", pool_size=6, **dbconfig
    )
    return pool


def load_data_to_database(connection_pool):
    cnx = connection_pool.get_connection()
    cursor = cnx.cursor()

    # 避每次執行app.py重複操作:前提-資料尚未存在
    cursor.execute("SELECT COUNT(*) FROM attractions")
    if (cursor.fetchone())[0] > 0:
        return

    with open("taipei-attractions.json", "r", encoding="utf-8") as file:
        data = json.load(file)
        attractions = data["result"]["results"]
    for attraction in attractions:
        name = attraction["name"]
        description = attraction["description"]
        address = attraction["address"]
        lat = float(attraction["latitude"])
        lng = float(attraction["longitude"])
        mrt = attraction["MRT"]
        category = attraction["CAT"]
        transport = attraction["direction"]
        image_urls = attraction["file"].split("https://")
        filtered_images = [
            f"https://{url}"
            for url in image_urls
            if url and (url.lower().endswith("jpg") or url.lower().endswith("png"))
        ]
        images = ",".join(filtered_images)

        sql = """
        INSERT INTO attractions
            (name, description, address, lat, lng,
             mrt, category, transport, images)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE description = VALUES(description),
        address = VALUES(address), lat = VALUES(lat),
        lng = VALUES(lng), mrt = VALUES(mrt),
        category = VALUES(category), transport = VALUES(transport),
        images = VALUES(images);
        """
        try:
            cursor.execute(
                sql,
                (
                    name,
                    description,
                    address,
                    lat,
                    lng,
                    mrt,
                    category,
                    transport,
                    images,
                ),
            )
            cnx.commit()
            print(f"Inserted: {name}")
        except mysql.connector.Error as err:
            print(f"Error: {err}")
            print(f"SQL: {sql}")
            print(
                f"Values: {name, description, address, lat, lng, mrt, category, transport, images}"
            )
    cursor.close()
    cnx.close()


# 可獨立測試，不作為模組引入
if __name__ == "__main__":
    db_pool = create_pool()
    load_data_to_database(db_pool)
