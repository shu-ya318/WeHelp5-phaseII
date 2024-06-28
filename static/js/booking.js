document.addEventListener('DOMContentLoaded', function() {
let UserInformation = {};
let BookingInformation = {};
const deleteButton = document.getElementById('delete');


//預定
async function fetchBookingInfo(){
    try {  
        const response = await fetch('/api/booking', {
            method: 'GET', 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${storedToken}`
            }
        });
        if (response.status === 200) {
            const jsonData = await response.json();
            const orderForm = document.getElementById('orderForm');
            const deletedOrderForm = document.getElementById('deleted-orderForm');
            const footer = document.querySelector('.l-footer');
            if(!jsonData) {
                orderForm.style.display = 'none';
                deletedOrderForm.style.display = 'block';
                footer.style.height = '100vh';
                return;
            }
            BookingInformation = jsonData.data; 
            console.log(BookingInformation);
            renderBookingInfo(BookingInformation);
            deleteButton.addEventListener('click', deleteBooking);
        } else if (response.status === 403) {
            throw new Error('未登入系統，拒絕存取');
        } else {
            throw new Error(`HTTP 狀態碼錯誤, status = ${response.status}`);
        }
    }catch (error) {
        console.error('請求接收失敗或操作失敗等錯誤發生:', error.message);
    }
}
function renderBookingInfo(BookingInfo){
    const attractionImage= document.getElementById('img');
    const attractionName = document.getElementById('attraction-name');
    const BookingDate = document.getElementById('date');
    const BookingTime = document.getElementById('time');
    const BookingPrice = document.getElementById('price');
    const attractionAddress = document.getElementById('address');
    const totalPrice = document.getElementById('total-price');
    attractionImage.src = BookingInfo.attraction.image ;
    attractionName.textContent =  `台北一日遊 ： ${BookingInfo.attraction.name}`;
    BookingDate.textContent =  BookingInfo.date ;
    BookingTime.textContent =  BookingInfo.price === 2000 ? '早上 9 點至下午 1 點' : '下午 2 點至晚上 9 點';
    BookingPrice.textContent =  `新台幣 ${BookingInfo.price} 元` ;
    attractionAddress.textContent = BookingInfo.attraction.address ;
    totalPrice.textContent = `總價 ： 新台幣 ${BookingInfo.price} 元`;
}

async function deleteBooking(){   
    try {
        const response = await fetch('/api/booking', {
            method: 'DELETE', 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${storedToken}`
            }
        });
        if (response.status === 200) {
            const jsonData = await response.json();
            if (!jsonData) {
                throw new Error('無法返回有效回應，刪除預定表單失敗');
            }
            window.location.href = "/booking";
        } else if (response.status === 403) {
            throw new Error('未登入系統，拒絕存取');
        } else {
            throw new Error(`HTTP 狀態碼錯誤, status = ${response.status}`);
        }
    } catch (error) {
        console.error('操作刪除失敗或渲染切換失敗等錯誤發生:', error.message);
    }
}


//下訂
function handleOrder(){
     //聯資取值

    //信用卡
    //1.輸入規則+驗證
    //2.串金流
}


//輸入欄位驗證 1.  0或正整數  2.限制長度 (3.輸入完的特別顯示方式)
function setupOrderFormInput() {
    const ordererPhone = document.getElementById('phone');
    const cardNumber = document.getElementById('cardNumber');
    const expirationDate = document.getElementById('expirationDate');
    const cvv = document.getElementById('cvv');

    ordererPhone.addEventListener('input', validatePhone);
    cardNumber.addEventListener('input', validateCardNumber);
    expirationDate.addEventListener('input', validateExpirationDate);
    cvv.addEventListener('input', validateCVV);
}

function validatePhone(event){
    const input = event.target;
    let value = input.value.replace(/\D/g, '');
    if (value.length > 10) {
        value = value.substring(0, 10); 
    }
    input.value = value;
}
function validateCardNumber(event) {
    const input = event.target;
    let value = input.value.replace(/\D/g, ''); 
    if (value.length > 16) {
        value = value.substring(0, 16); 
    }
    let visibleSection = value;
    if (value.length === 16) {
        visibleSection = value.substring(0, 4) + ' **** **** ' + value.slice(-4);
    }
    input.value = visibleSection;
}
function validateExpirationDate(event) {
    const input = event.target;
    let value = input.value.replace(/\D/g, '');
    if (value.length > 4) {
        value = value.substring(0, 4); 
    }
    input.value = value.replace(/(.{2})/, '$1/').substring(0, 5);
}
function validateCVV(event) {
    const input = event.target;
    let value = input.value.replace(/\D/g, '');
    if (value.length > 3) {
        value = value.substring(0, 3); 
    }
    input.value = value;
}


setupOrderFormInput();
fetchBookingInfo();

});
