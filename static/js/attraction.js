document.addEventListener('DOMContentLoaded', function() {
/*對比宣告方式 (1)儲存URL特定值->函式執行時不變動，可const (2)儲存接收api資料->函示執行讓[ ]寫入新接收值會變動，僅let*/
const pathSegments = window.location.pathname.split('/');   //需先儲存URL特定/後的值 ;澄清:非 URL的query，出現在URL的?後
const attractionId = pathSegments[pathSegments.length - 1];
let attraction =[ ];  
/* 選取唯一元素:ID選擇器 效率>CSS樣式選擇器*/ 
//景點各式資料
const attractionName = document.getElementById('name');
const attractionCategory = document.getElementById('category');
const attractionMrt = document.getElementById('mrt');
const attractionDescription = document.getElementById('description');
const attractionAddress = document.getElementById('address');
const attractionTransport = document.getElementById('transport');
//景點圖切換
let currentIndex =0; 
const currentImage= document.getElementById('img');
const leftArrow= document.getElementById('left-arrow');
const rightArrow= document.getElementById('right-arrow');
const circlesContainer = document.getElementById('circles-container');
//表單
const morningChoice = document.getElementById('morning');
const afternoonChoice = document.getElementById('afternoon');
const charge = document.getElementById('charge');


/*費用切換*/
function updateCharge() {
    charge.textContent = morningChoice.checked ? '新台幣 2000元' : '新台幣 2500元';
    charge.style.marginLeft = '3px';
}
//更新值顯示時機: (1)點擊不同核取方塊時 或 (2)初次載入頁面時
morningChoice.addEventListener('change', updateCharge);
afternoonChoice.addEventListener('change', updateCharge);


/*處理景點各式資料*/
//先統一接收資料庫所有資料
async function fetchAttractionData(attractionId) {  
    try {  
        const response = await fetch(`/api/attraction/${attractionId}`); //務必用樣板字串值改成 已整理過的動態實際資料值
        if (!response.ok) {
            throw new Error(`HTTP 狀態碼錯誤, status = ${response.status}`);
        }
        const jsonData = await response.json();
        if (!jsonData) {    //表示id值null或undefined
            throw new Error('無法從資料庫取得此錯誤id資料');
        }
        attraction = jsonData.data;
        //更新 連帶變化、渲染的函式
        updateImage(attraction); 
        createCircles(attraction.images.length);
        updateCurrentCircle(0); 
        renderAttraction(attraction);  
    } catch (error) {
        console.error('請求錯誤或渲染失敗等錯誤發生:', error.message); //error.message顯示是哪種拋出異常情形
        window.location.href = '/';  
    }
}

/*滑動顯示單圖*/
//(一)渲染單圖
function  updateImage(attraction){  
    currentImage.src= attraction.images[currentIndex];    
}
//觸發事件時建立&執行監聽->呼叫更新值函式，務必傳入參數景點資料 +記得連帶更新當前圓點傳入的currentIndex
//(往左操作: 遞減+考量首張時，例外更新值為尾張圖索引 )(往右:遞增，尾張時，例外更新值為首張索引)
leftArrow.addEventListener('click', function() {
        currentIndex = currentIndex > 0 ? currentIndex - 1 : attraction.images.length - 1;
        updateImage(attraction);
        updateCurrentCircle(currentIndex);
});
rightArrow.addEventListener('click', function() {
        currentIndex = currentIndex < attraction.images.length - 1 ? currentIndex + 1 : 0;
        updateImage(attraction);
        updateCurrentCircle(currentIndex);
});
//(二)圓點顯示滑動哪張 (因圓點數固定,分開寫)  1.先讓每1圖片元素 動態生成元素DOM，確立圓點總數 2. 利用currentIndex來對應哪個圓點改變css
    //遍歷寫法: 只利用陣列長度->for迴圈更有效率 、細部操作陣列資料值->forEach更方便
function createCircles(totalImages) {               //呼叫時，再把參數改成實際資料值attraction.images.length
    for (let i = 0; i < totalImages; i++) {         
        const circle = document.createElement('img');
        circle.className = 'm-slider-circle';
        circle.src = '/static/image/circle.png';
        circle.alt = 'slider-circle';
        circlesContainer.appendChild(circle);
    }
}
function updateCurrentCircle(currentIndex) {  //(需多考量 原選中回到未選中情形)即使有初始值,仍對每1圓點元素DOM 檢查如何更新值       
    const circles = document.querySelectorAll('.m-slider-circle, .m-slider-selectedcircle');
    circles.forEach((circle, index) => {   
        circle.className = ( index === currentIndex ) ? 'm-slider-selectedcircle' : 'm-slider-circle';
        circle.src = ( index === currentIndex ) ? '/static/image/selected_circle.png' : '/static/image/circle.png';
    });
}


//顯示各式資料
function renderAttraction(attraction){
    attractionName.textContent = attraction.name ;
    attractionCategory.textContent = attraction.category ;
    attractionMrt.textContent = attraction.mrt ;
    attractionDescription.textContent = attraction.description ;
    attractionAddress.textContent = attraction.address ;
    attractionTransport.textContent = attraction.transport ;
}


//首次頁面加載完成時 
updateCharge();
fetchAttractionData(attractionId);  
});
