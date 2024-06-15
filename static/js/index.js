document.addEventListener('DOMContentLoaded', function() {
let mrts = [ ] ; 
let attractions =[ ];
let nextPage = 0;              
let isLoadingAttractions = false;
let footerObserver = null;   

const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const mrtsList = document.getElementById('mrts-list');
const attractionsGrid = document.getElementById('attractions-grid');
const leftArrow = document.getElementById('left-arrow');
const rightArrow = document.getElementById('right-arrow');


/*欄位搜尋   (+呼叫函式處理景點)  ++防抖功能*/
const debouncedFetchAttractionsData = debounce(async () => {
  const keyword = searchInput.value;
  //仍需手動設定 清空舊渲染資料
  attractions = []; 
  nextPage = 0;
  await fetchAttractionsData(0, keyword); 
}, 300);

searchButton.addEventListener('click', debouncedFetchAttractionsData);


/*捷運站名列表 (+左右滾動)(+呼叫函式搜尋-->搜尋已含處理景點)*/
//函式call API
async function fetchMrtData() {  
  try {  
    const response = await fetch('/api/mrts');
    if (!response.ok) {
      throw new Error(`HTTP 狀態碼錯誤, status = ${response.status}`);
    }
    const jsonData = await response.json();
    if (!jsonData) {
      throw new Error('無法從資料庫取得捷運站名資料');
    }
    mrts = jsonData.data ;
    renderMrtNames(mrts);    //參數: 接收API資料
  }catch (error) {
      console.error('接收失敗:', error.message);
  }
}
//內層函式渲染: 顯示初始值(DOM -->遍歷:每1元素，動態顯示值+設CSS) + 點擊才移動
function renderMrtNames(mrts){  //外部參數:每次渲染資料值可能變動
  mrtsList.innerHTML = '';      //避免重複加入已有者
  mrts.forEach( (mrt) => {
      let listItem = document.createElement('li');
      listItem.className = 'm-list-bar-item';
      listItem.textContent = mrt; 

      //搭配 搜尋: 任1動態生成元素 被點擊成為輸入欄位值+ 自動執行按鈕送出搜尋來處理景點
      listItem.addEventListener('click', () => {
        searchInput.value = mrt;
        //更新值後，(1)清除舊資料 +(2)重設頁碼，fetchAttractionsData的(page === 0)生效
        attractions = []; 
        nextPage = 0;    
        debouncedFetchAttractionsData();//取代searchButton.click();
      });
      mrtsList.appendChild(listItem);
  });
       scrollMrtsList();    // 撰寫位置邏輯: (o)只綁定父容器  (x)動態產生子元素節點內->重複綁定&建立事件監聽器
}      
  /*  不多寫判斷事件執行狀態條件，也能正確初始化建立1次
      let arrowsInitialized = false; 
      if (!arrowsInitialized) { 
            scrollMrtsList();
            arrowsInitialized = true;
          } */

//再內層函式:點擊移動 *反向，分開寫
function scrollMrtsList() {
  //避免裝置小BUG:位移太多無法點特定站名
  const scrollDistance = window.matchMedia('(max-width: 360px)').matches ? 20 : 250;

  leftArrow.onclick = function() { 
    mrtsList.scrollBy({ left: -scrollDistance, behavior: 'smooth' });
  };
  rightArrow.onclick = function() {
    mrtsList.scrollBy({ left: scrollDistance, behavior: 'smooth' });
  };
}

    
/*景點*/
//函式call API
async function fetchAttractionsData(page = nextPage, keyword = ' ') {  
  if (isLoadingAttractions || page === null) return; //確保非加載中 或 下頁有資料值 才請求
  isLoadingAttractions = true;

  try {  
    const response = await fetch(`/api/attractions?page=${page}&keyword=${encodeURIComponent(keyword)}`);
    const isInitialLoad = page === 0;    
console.log("Rendering attractions", attractions, isInitialLoad);  
    if (!response.ok) {
      throw new Error(`HTTP 狀態碼錯誤, status = ${response.status}`);
    }
    const jsonData = await response.json();
    console.log('JSON data parsed', jsonData); 
    if (!jsonData) {   
      throw new Error('無法從資料庫取得景點資料');
    }
    if (jsonData.nextPage === nextPage) return; // 檢查 nextPage 是否已更新，以防過快滾動重複取得同頁API
    nextPage = jsonData.nextPage   //更新值為下頁頁碼，值已含數字或null    
    attractions = isInitialLoad ? jsonData.data : attractions.concat(jsonData.data); //首次加載才全新、繼續請求的合併舊新資料
    renderAttractions(jsonData.data, isInitialLoad); //參數:接收API資料+初始值首頁
  }catch (error) {
    console.error('請求錯誤或渲染失敗等錯誤發生', error.message);
  }finally {
    isLoadingAttractions = false;
    updateFooterDisplay ( );  // 額外寫函式處理<footer>，呼叫位置: finally 接收完畢(不問成敗)更新  (x)try 
  }
}

//內層函式: 處理<footer> (邏輯:display不切換顯示隱藏 、CSS不寫死高度即自動更往下推位置) (作為 滾動功能的 監聽 觀察器) 
//         ++節流功能
const throttledFetchAttractionsData = throttle(fetchAttractionsData, 200);

function updateFooterDisplay() {
  const footer = document.querySelector('.l-footer'); //@@從common.js引入元素DOM:局部宣告變數才會執行函式
  if (footer && !footerObserver) {    
    footerObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !isLoadingAttractions && nextPage !== null) {
          throttledFetchAttractionsData();
        }
      });
    }, { root: null, threshold: 0.5, rootMargin: '50px' });
  footerObserver.observe(footer); 
} else {
  console.error('<Footer>觀察器未正確建立');
}
}


//內層函式渲染 (內部呼叫函式動態生成元素)(搭配 ,內部呼叫處理<footer>函式)
function renderAttractions(attractions, isInitialLoad) { 
  console.log(`Rendering attractions: Initial load = ${isInitialLoad}`, attractions); 
  if (isInitialLoad) attractionsGrid.innerHTML = '';//(o)僅首次加載覆蓋/清空舊資料 (x)勿寫grid.innerHTML = ''，否則每次call API 新資料逕覆蓋/清空 舊資料
  attractions.forEach(attraction => {
      const item = createAttractionElement(attraction);
      attractionsGrid.appendChild(item);
  });
  updateFooterDisplay(); // 最後更新<footer>，確保顯示位置動態下移所有資料後方
}
//再內層函式:動態生成網格內每1個<景點item>
  function createAttractionElement(attraction) {
      //相對父容器<div class="m-container-items">
      const item = document.createElement('div');
      item.className = 'm-container-items';
        //第1個直接子元素:<div class="m-container-imageAndTitle">
      const imageTitleDiv = document.createElement('div');
      imageTitleDiv.className = 'm-container-imageAndTitle';
            //直接子元素內部元素
      const attractionLink = document.createElement('a');
      attractionLink.id = 'attraction-link';
      attractionLink.href = `/attraction/${attraction.id}`; //app.py路由處理URL,返回寫好渲染的html檔  //(x)非寫/api/attraction/${attraction.id}，僅返回後端資料庫原始格式檔
                //內部元素再包含超連結元素
      const image = document.createElement('img');
      image.className = 'm-attraction-image';
      image.src = '/static/image/placeholder.png';
      image.dataset.src = attraction.images[0]; // 接收圖片: 先顯示佔位符 +暫存於dataset，執行懶加載才改為實際值
      attractionLink.appendChild(image);

      const nameDiv = document.createElement('div');
      nameDiv.className = 'm-attraction-name';
      nameDiv.textContent = attraction.name;
        //統一加入直接子元素
      imageTitleDiv.appendChild(attractionLink);
      imageTitleDiv.appendChild(nameDiv);

        //第2個直接子元素: <div class="m-flexible-container">
      const flexContainer = document.createElement('div');
      flexContainer.className = 'm-flexible-container';
           //直接子元素內部元素
      const mrtSpan = document.createElement('span');
      mrtSpan.textContent = attraction.mrt;
      const categorySpan = document.createElement('span');
      categorySpan.textContent = attraction.category;

      flexContainer.appendChild(mrtSpan);
      flexContainer.appendChild(categorySpan);

      //統一加入相對父容器 
      item.appendChild(imageTitleDiv);
      item.appendChild(flexContainer);

      //DOM建立後，才執行圖片懶加載
      lazyLoadImage(image);

      return item;
  }


//接收&渲染的附加 懶加載接收圖片功能 (建立另一監聽觀察器)
function lazyLoadImage(image) {
  const lazyLoadingObserver = new IntersectionObserver(entries => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        image.src = image.dataset.src;
        lazyLoadingObserver.unobserve(image); 
      }
    });
  }, { rootMargin: '50px', threshold: 0.5 });
  lazyLoadingObserver.observe(image);
}
//附加 防抖功能(適用輸入元素)
function debounce(func, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}
//附加 節流功能(適用滾動事件)
function throttle(func, delay) {
  let lastCall = 0;
  return function(...args) {
    const now = new Date().getTime();
    if (now - lastCall < delay) return;
    lastCall = now;
    return func(...args);
  };
}


//首次頁面加載完成時，執行並渲染的內容
fetchMrtData();
fetchAttractionsData();   

document.addEventListener("footerReady", function() {
  updateFooterDisplay();
});
});
