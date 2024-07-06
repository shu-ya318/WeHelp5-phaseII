document.addEventListener('DOMContentLoaded', function() {
    let orderPayment = {};
    let orderInformation = {};
    const currentOrderNumber = document.getElementById('current-order-number');
    //先儲網址查詢參數動態值
    const getQueryByName = (name) => {
        const query = new URLSearchParams(location.search);
        return decodeURIComponent(query.get(name));
      }
    const orderNumber = getQueryByName('number'); // 實際 ?後的查詢參數名
    currentOrderNumber.textContent =  `您的訂單編號為:  ${orderNumber}`;


    async function fetchOrderInfo(){
        try {  
            const response = await fetch(`/api/order/${orderNumber}`, {
                method: 'GET', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${storedToken}`
                }
            });
            if (response.status === 200) {
                const jsonData = await response.json();
                orderInformation = jsonData.data; 
                renderOrderInfo(orderInformation);
            } else if (response.status === 403) {
                throw new Error('未登入系統，拒絕存取');
            } else {
                throw new Error(`HTTP 狀態碼錯誤, status = ${response.status}`);
            }
        } catch (error) {
            console.error('請求接收失敗或操作失敗等錯誤發生:', error.message);
        }finally{         //逕寫全域無法作用@@ (似跟coomon.js操作衝突)
            const footer = document.querySelector('.l-footer');
            footer.style.height = '100vh';
        }

    }

    function renderOrderInfo(orderInfo){
        const orderElements= getOrderInfoElements();
        orderElements.contactPerson.textContent =  `聯絡人:${orderInfo.contact.name}` ;
        orderElements.contactEmail.textContent =  `聯絡信箱:${orderInfo.contact.email}` ;
        orderElements.contactPhone.textContent =  `聯絡號碼:${orderInfo.contact.phone}` ;
        orderElements.bookingAttraction.textContent =  `預定景點:${orderInfo.trip.attraction.name}` ;
        orderElements.bookingTime.textContent =  `預定時程:${orderInfo.trip.date} ${orderInfo.trip.time=== 'morning' ?'上半天' :'下半天' }` ;
        orderElements.bookingPrice.textContent =  `行程價格:${orderInfo.price}` ;
        orderElements.paymentStatus.textContent = `付款狀態: ${orderInfo.status === 0 ? '已付款' :'未付款'}`;
    }
    function getOrderInfoElements() {
        return {
            contactPerson: document.getElementById('contact-person'),
            contactEmail: document.getElementById('contact-email'),
            contactPhone: document.getElementById('contact-phone'),
            bookingAttraction: document.getElementById('booking-attraction'),
            bookingTime: document.getElementById('booking-time'),
            bookingPrice: document.getElementById('booking-price'),
            paymentStatus: document.getElementById('payment-status')
        }
    }

    const redirectButton = document.getElementById('redirect-button');
    redirectButton.addEventListener('click',() =>window.location.href = '/');
    
    fetchOrderInfo();
});