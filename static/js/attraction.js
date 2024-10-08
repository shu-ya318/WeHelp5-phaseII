document.addEventListener("DOMContentLoaded", function () {
  const pathSegments = window.location.pathname.split("/");
  const attractionId = pathSegments[pathSegments.length - 1];
  let attraction = [];
  /* 選取唯一元素*/
  //  景點各式資料
  const attractionName = document.getElementById("name");
  const attractionCategory = document.getElementById("category");
  const attractionMrt = document.getElementById("mrt");
  const attractionDescription = document.getElementById("description");
  const attractionAddress = document.getElementById("address");
  const attractionTransport = document.getElementById("transport");
  //  景點圖切換
  let isFirstLoad = true;
  let currentIndex = 0;
  const currentImage = document.getElementById("img");
  const leftArrow = document.getElementById("left-arrow");
  const rightArrow = document.getElementById("right-arrow");
  const circlesContainer = document.getElementById("circles-container");

  /*  處理景點各式資料*/
  //  先統一接收資料庫所有資料
  async function fetchAttractionData(attractionId) {
    try {
      const response = await fetch(`/api/attraction/${attractionId}`); // 務必用樣板字串值改成 已整理過的動態實際資料值
      if (!response.ok) {
        throw new Error(`HTTP 狀態碼錯誤, status = ${response.status}`);
      }
      const jsonData = await response.json();
      if (!jsonData || !jsonData.data) {
        //  表示id值null或undefined
        throw new Error("無法返回有效回應，資料庫查無此id資料。");
      }
      attraction = jsonData.data;
      updateImage(attraction);
      createCircles(attraction.images.length);
      updateCurrentCircle(0);
      renderAttraction(attraction);
      setupBooking(attraction);
    } catch (error) {
      console.error("請求接收失敗或渲染失敗等錯誤發生:", error.message);
      window.location.href = "/";
    }
  }

  /*  滑動顯示單圖*/
  //  (一)渲染單圖，含點擊時滑動  +搭配 節流功能(定時器寫法)
  //  處理 點擊事件
  //  用節流函式包裝的事件 執行監聽器
  const throttle = (callback, delay = 2000) => {
    let shouldWait = false;
    let waitingArgs;

    const timeoutFunc = () => {
      if (waitingArgs == null) {
        shouldWait = false;
      } else {
        callback(...waitingArgs);
        waitingArgs = null;
        setTimeout(timeoutFunc, delay);
      }
    };

    return (...args) => {
      if (shouldWait) {
        waitingArgs = args;
        return;
      }
      callback(...args);
      shouldWait = true;
      setTimeout(timeoutFunc, delay);
    };
  };
  //  (往左操作: 遞減+考量首張時，例外更新值為尾張圖索引 )(往右:遞增，尾張時，例外更新值為首張索引)
  //  呼叫更新值函式，參數景點資料 +連帶更新當前圓點傳入currentIndex
  const handleArrowClick = (direction) => {
    currentIndex =
      direction === "left"
        ? currentIndex > 0
          ? currentIndex - 1
          : attraction.images.length - 1
        : currentIndex < attraction.images.length - 1
        ? currentIndex + 1
        : 0;
    updateImage(attraction);
    updateCurrentCircle(currentIndex);
  };
  const throttledLeftArrowClick = throttle(
    () => handleArrowClick("left"),
    2000
  );
  const throttledRightArrowClick = throttle(
    () => handleArrowClick("right"),
    2000
  );

  leftArrow.addEventListener("click", throttledLeftArrowClick);
  rightArrow.addEventListener("click", throttledRightArrowClick);

  function updateImage(attraction) {
    currentImage.src = attraction.images[currentIndex];
    //  考量限制條件: 非首次加載頁面才淡出入
    if (isFirstLoad) {
      isFirstLoad = false;
    } else {
      //  淡出-出場消失效果
      currentImage.style.opacity = 0.5;
      //  淡入(延遲時間回原圖)
      setTimeout(() => {
        currentImage.style.opacity = 1;
      }, 600); //等同 CSS transition 秒數
    }
  }
  //  (二)圓點顯示滑動哪張 (因圓點數固定,分開寫新函式)  1.先讓每1圖片元素 動態生成元素DOM，確立圓點總數 2. 利用currentIndex來對應哪個圓點改變css
  //  遍歷寫法: 只利用陣列長度->for迴圈更有效率 、細部操作陣列資料值->forEach更方便
  function createCircles(totalImages) {
    //  呼叫時，再把參數改成實際資料值attraction.images.length
    circlesContainer.innerHTML = "";
    for (let i = 0; i < totalImages; i++) {
      const circle = document.createElement("img");
      circle.className = "m-slider-circle";
      circle.src = "/static/image/circle.png";
      circle.alt = "slider-circle";
      circlesContainer.appendChild(circle);
    }
  }
  function updateCurrentCircle(currentIndex) {
    //  (需多考量 原選中回到未選中情形)即使有初始值,仍對每1圓點元素DOM 檢查如何更新值
    const circles = document.querySelectorAll(
      ".m-slider-circle, .m-slider-selectedcircle"
    );
    circles.forEach((circle, index) => {
      circle.className =
        index === currentIndex ? "m-slider-selectedcircle" : "m-slider-circle";
      circle.src =
        index === currentIndex
          ? "/static/image/selected_circle.png"
          : "/static/image/circle.png";
    });
  }

  //  顯示各式資料
  function renderAttraction(attraction) {
    attractionName.textContent = attraction.name;
    attractionCategory.textContent = attraction.category;
    attractionMrt.textContent = attraction.mrt;
    attractionDescription.textContent = attraction.description;
    attractionAddress.textContent = attraction.address;
    attractionTransport.textContent = attraction.transport;
  }
  //  首次頁面加載完成時
  fetchAttractionData(attractionId);

  //  提交預定表單
  function setupBooking(attraction) {
    const BookingElements = getBookingElements();
    updatePrice(BookingElements);
    BookingElements.morningChoice.addEventListener("change", () =>
      updatePrice(BookingElements)
    ); // 避逕寫解構參數
    BookingElements.afternoonChoice.addEventListener("change", () =>
      updatePrice(BookingElements)
    );
    BookingElements.bookingButton.addEventListener("click", (event) =>
      submitBooking(event, BookingElements, attraction)
    );
  }
  function updatePrice(BookingElements) {
    BookingElements.charge.style.marginLeft = "3px";
    BookingElements.charge.textContent = BookingElements.morningChoice.checked
      ? "新台幣 2000元"
      : "新台幣 2500元";
  }

  async function submitBooking(event, BookingElements, attraction) {
    const signInElements = await getModalElements(); // 使用共通檔指定函式的值+呼叫另指定函式->(o)async +新變數儲存await呼叫值，再呼叫另指定函寫新參數(x)未等待,新變數無法接收值
    event.preventDefault();
    if (!storedToken) {
      showModalSignin(signInElements);
      return;
    }
    let selectedDate = BookingElements.date.value;
    let time = BookingElements.morningChoice.checked ? "morning" : "afternoon";
    let price = BookingElements.morningChoice.checked ? 2000 : 2500;
    if (!selectedDate) {
      alert("請選擇未來近2個月內預定日期!");
      return;
    }

    const requestBody = {
      attractionId: attraction.id,
      date: BookingElements.date.value,
      time: time,
      price: price,
    };
    fetch("/api/booking", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${storedToken}`,
      },
      body: JSON.stringify(requestBody),
    })
      .then((response) =>
        response
          .json()
          .then((data) => ({ status: response.status, body: data }))
      )
      .then(({ status, body }) => {
        if (status === 200) {
          window.location.href = "/booking";
        } else if (status === 400) {
          throw new Error("預定日期只能為未來2個月內!");
        } else {
          throw new Error("預定發生未知錯誤，請稍後再試!");
        }
      })
      .catch((error) => {
        alert(error.message);
      });
  }
  function getBookingElements() {
    return {
      date: document.getElementById("date"),
      morningChoice: document.getElementById("morning"),
      afternoonChoice: document.getElementById("afternoon"),
      charge: document.getElementById("charge"),
      bookingButton: document.getElementById("booking-button"),
    };
  }
});
