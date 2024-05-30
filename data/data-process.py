import json
import os
import mysql.connector


# 實務常用的連接資料庫寫法(Connection Pool) #設定大小約小型負載
def create_pool():
    dbconfig = {
        'host': 'localhost',
        'user': 'root',
        'password': os.getenv('DB_PASSWORD'),
        'database': 'taipeiattractions'
    }
    pool = mysql.connector.pooling.MySQLConnectionPool(
        pool_name='mypool',
        pool_size=6,
        **dbconfig
    )
    return pool


def load_data_to_database(connection_pool):
    cnx = connection_pool.get_connection()
    cursor = cnx.cursor()

    with open('taipei-attractions.json', 'r', encoding='utf-8') as file:
        data = json.load(file)
        attractions = data['result']['results']

    for attraction in attractions:
        # 先 統一整理取得json格式資料值(注意mySQL欄位名調整，比對json資料、API規格的屬性名) 
        name = attraction['name']
        description = attraction['description']
        address = attraction['address']
        lat = float(attraction['latitude'])
        lng = float(attraction['longitude'])
        mrt = attraction['MRT']
        category = attraction['CAT']
        transport = attraction['direction']

        image_urls = attraction['file'].split('https://')
        filtered_images = [f'https://{url}' for url in image_urls if url and (url.lower().endswith('jpg') or url.lower().endswith('png'))]
        images = ','.join(filtered_images)

        # 再 插入資料進資料庫 (把name當唯一索引值比對，若重複則僅更新name以外欄位的資料值)
        sql = '''
        INSERT INTO attractions (name, description, address, lat, lng, mrt, category, transport, images)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            description = VALUES(description),
            address = VALUES(address),
            lat = VALUES(lat),
            lng = VALUES(lng),
            mrt = VALUES(mrt),
            category = VALUES(category),
            transport = VALUES(transport),
            images = VALUES(images);
        '''
        try:
            cursor.execute(sql, (name, description, address, lat, lng, mrt, category, transport, images))
            cnx.commit()
            print(f'Inserted: {name}')
        except mysql.connector.Error as err:
            print(f'Error: {err}')
            print(f'SQL: {sql}')
            print(f'Values: {name, description, address, lat, lng, mrt, category, transport, images}')

    cursor.close()
    cnx.close()


if __name__ == '__main__':
    db_pool = create_pool()
    load_data_to_database(db_pool)
