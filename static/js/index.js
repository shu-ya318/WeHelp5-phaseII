document.addEventListener("DOMContentLoaded", function() {
 /*表單*/  
document.getElementById('signinButton').addEventListener('click', function(event) {
  document.querySelector('.l-backdrop').style.display = 'flex'; 
  document.querySelector('.l-modal-signin').style.display = 'flex';
  document.querySelector('.l-modal-signup').style.display = 'none';
});
document.getElementById('signupButton').addEventListener('click', function(event) {
  document.querySelector('.l-backdrop').style.display = 'flex'; 
  document.querySelector('.l-modal-signup').style.display = 'flex';
  document.querySelector('.l-modal-signin').style.display = 'none';
});
  // 選class設相同的全部按鈕，點擊任一者
document.querySelectorAll('.m-form-close').forEach(button => {
  button.addEventListener('click', function(event) {
    document.querySelector('.l-backdrop').style.display = 'none'; 
    document.querySelector('.l-modal-signin').style.display = 'none';
    document.querySelector('.l-modal-signup').style.display = 'none';

  });
});


/*全域變數，儲存重複利用的值*/
let mrts = [ ] ; 
let attractions =[ ];

let nextPage = 0;              //初始值:首頁(頁碼0)
let isLoadingAttractions = false;
let footerObserver = null;   // 觀察器宣告在全域


/*欄位搜尋   (搭配,內部呼叫函式處理景點)*/
document.querySelector('.m-search-button').addEventListener('click', async () => {
  //已全域宣告，不再寫 nextPage =  0;  attractions = [];  
  const keyword = document.querySelector('.m-search-input').value;
  await fetchAttractionsData(0, keyword);        //固定初始值: 第1頁+輸入欄位值 //非同步確保不重載/刷新頁面
  /*fetchAttractionsData內部 (1)已考量 清空現有資料(2)renderAttractions  已考量處理<footer> */
});


/*捷運站名列表 (含左右移動功能)(搭配 ,內部呼叫函式搜尋-->搜尋已含呼叫處理景點)*/
//函式call API
async function fetchMrtData() {  
  try {  
    /*儲存接收資料值 --> 渲染功能*/
    const response = await fetch("/api/mrts");
    const jsonData = await response.json();
    mrts = jsonData.data ;
    renderMrtNames(mrts);    //參數: 接收API資料
  }catch (error) {
      console.error('接收捷運站名資料失敗', error);
  }
}
//內層函式渲染: 顯示初始值(DOM -->遍歷:每1元素，動態 顯示值+設CSS) + 點擊才移動
function renderMrtNames(mrts){  //外部參數:每次渲染資料值可能變動
  const mrtsList = document.querySelector(".m-list-bar-items");
  mrtsList.innerHTML = '';      //避免重複加入已有者
  mrts.forEach( (mrt) => {
      let listItem = document.createElement("li");
      listItem.className = "m-list-bar-item";
      listItem.textContent = mrt; 

      //搭配 搜尋: 任1動態生成元素 被點擊會成為輸入欄位值+ 呼叫自動執行 按鈕送出搜尋來處理景點
      listItem.addEventListener('click', () => {
        document.querySelector('.m-search-input').value = mrt;
        //更新值後，(1)連帶清除/覆蓋舊景點資料 +(2)重設頁碼，讓fetchAttractionsData的判斷page === 0生效
        attractions = []; 
        nextPage = 0;    
        document.querySelector('.m-search-button').click();
      });
      mrtsList.appendChild(listItem);
      //不寫scrollMrtsList(); 邏輯: (o)只綁定一整個父容器  (x)寫動態產生的各子元素DOM內->重複綁定&建立事件監聽器BUG 
  });
       scrollMrtsList();   
}      
  /*  不多寫判斷事件執行狀態條件，也能正確初始化建立1次
      let arrowsInitialized = false; 
      if (!arrowsInitialized) { 
            scrollMrtsList();
            arrowsInitialized = true;
          } */

//再內層函式:點擊移動 *反向，分開寫
function scrollMrtsList() {
  const mrtsList = document.querySelector(".m-list-bar-items");
  const leftArrow = document.querySelector(".m-list-bar-left-arrow");
  const rightArrow = document.querySelector(".m-list-bar-right-arrow");
  leftArrow.onclick = function() { // 確保不重複註冊&綁定事件監聽器 (O) onclick(X)addEventListener 
    mrtsList.scrollBy({ left: -350, behavior: 'smooth' });
  };
  rightArrow.onclick = function() {
    mrtsList.scrollBy({ left: 350, behavior: 'smooth' });
  };
}

    

/*景點*/
//函式call API
async function fetchAttractionsData(page = nextPage, keyword = "") {  
  if (isLoadingAttractions || page === null) return; //確保非加載中 或 下頁有資料值 才請求
  isLoadingAttractions = true;

  try {  
    const response = await fetch(`/api/attractions?page=${page}&keyword=${encodeURIComponent(keyword)}`);
    const jsonData = await response.json();
    nextPage = jsonData.nextPage   //更新值為下頁頁碼，值已含數字或null        
    attractions = page === 0 ? jsonData.data : attractions.concat(jsonData.data); //首次才全新、繼續請求的合併舊新資料
    renderAttractions(jsonData.data, page === 0); //參數:接收API資料+初始值首頁
  }catch (error) {
    console.error('接收景點資料失敗', error);
  }finally {
    isLoadingAttractions = false;
    updateFooterDisplay ( );  // 額外寫函式處理<footer>，呼叫位置: finally 接收完畢(不問成敗)更新  (x)try 
  }
}

//內層函式: 處理<footer> (邏輯:狀態未切換,CSS不寫死高度 自動更新位置) (作為 滾動功能的 監聽 觀察器)  
function updateFooterDisplay() {
  const footer = document.querySelector('.l-footer'); 
  if (!footerObserver) {    //只需建立1次觀察器 
    footerObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !isLoadingAttractions && nextPage !== null) {
          fetchAttractionsData();
        }
      });
    }, { root: null, threshold: 0.5, rootMargin: "50px" });
  }
  footerObserver.observe(footer); 
}


//內層函式渲染 (內部呼叫函式動態生成元素)(搭配 ,內部呼叫處理<footer>函式)
function renderAttractions(attractions, isInitialLoad) {
  const grid = document.getElementById('attractions-grid');  
  if (isInitialLoad) grid.innerHTML = '';//(o)僅首次加載覆蓋/清空舊資料 (x)勿寫grid.innerHTML = ''，否則每次call API 新資料逕覆蓋/清空 舊資料
  attractions.forEach(attraction => {
      const item = createAttractionElement(attraction);
      grid.appendChild(item);
  });
  updateFooterDisplay(); // 最後更新<footer>，確保顯示位置動態下移所有資料後方
}
//再內層函式:動態生成網格內每1個<景點item>
  function createAttractionElement(attraction) {
      const item = document.createElement('div');
      item.className = 'm-container-items';

      const imageTitleDiv = document.createElement('div');
      imageTitleDiv.className = 'm-container-imageAndTitle';

      const imageDiv = document.createElement('div');
      imageDiv.className = 'm-attraction-image';
      imageDiv.dataset.src = attraction.images[0]; // 接收圖片: 先暫存dataset，不加載 +視覺效果用佔位符
      imageDiv.style.backgroundImage = 'url("/static/image/placeholder.png")'; 

      const nameDiv = document.createElement('div');
      nameDiv.className = 'm-attraction-name';
      nameDiv.textContent = attraction.name;

      imageTitleDiv.appendChild(imageDiv);
      imageTitleDiv.appendChild(nameDiv);

      const flexContainer = document.createElement('div');
      flexContainer.className = 'm-flexible-container';

      const mrtSpan = document.createElement('span');
      mrtSpan.textContent = attraction.mrt;
      const categorySpan = document.createElement('span');
      categorySpan.textContent = attraction.category;

      flexContainer.appendChild(mrtSpan);
      flexContainer.appendChild(categorySpan);

      item.appendChild(imageTitleDiv);
      item.appendChild(flexContainer);

      lazyLoadImage(imageDiv);

      return item;
  }

//接收&渲染的附加 懶加載接收圖片功能 (建立另一監聽觀察器)
function lazyLoadImage(imageElement) {
  const lazyLoadingObserver = new IntersectionObserver(entries => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        imageElement.style.backgroundImage = `url('${imageElement.dataset.src}')`;
        lazyLoadingObserver.unobserve(imageElement); 
      }
    });
  }, { rootMargin: "50px", threshold: 0.5 });

  lazyLoadingObserver.observe(imageElement);
}
//確保首次加載時，呼叫並隨後渲染
fetchMrtData();
fetchAttractionsData();   
});
