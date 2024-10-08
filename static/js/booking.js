document.addEventListener("DOMContentLoaded", function () {
  let bookingInformation = {};

  const attractionImage = document.getElementById("img");
  const attractionName = document.getElementById("attraction-name");
  const BookingDate = document.getElementById("date");
  const BookingTime = document.getElementById("time");
  const BookingPrice = document.getElementById("price");
  const attractionAddress = document.getElementById("address");

  const ordererPhone = document.getElementById("phone");
  const orderButton = document.getElementById("order-button");
  const orderInputs = document.querySelectorAll(
    "#name, #email, #phone, card-number, card-expiration-date, card-ccv"
  );

  //  預定
  async function fetchBookingInfo() {
    try {
      const response = await fetch("/api/booking", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${storedToken}`,
        },
      });
      if (response.status === 200) {
        const jsonData = await response.json();
        const orderForm = document.getElementById("orderForm");
        const deletedOrderForm = document.getElementById("deleted-orderForm");
        const deleteButton = document.getElementById("delete");
        const footer = document.querySelector(".l-footer");
        if (!jsonData) {
          orderForm.style.display = "none";
          deletedOrderForm.style.display = "block";
          footer.style.height = "100vh";
          return;
        }
        bookingInformation = jsonData.data;
        renderBookingInfo(bookingInformation);
        deleteButton.addEventListener("click", deleteBooking);
        getOrder(bookingInformation);
      } else if (response.status === 403) {
        throw new Error("未登入系統，拒絕存取");
      } else {
        throw new Error(`HTTP 狀態碼錯誤, status = ${response.status}`);
      }
    } catch (error) {
      console.error("請求接收失敗或操作失敗等錯誤發生:", error.message);
    }
  }
  function renderBookingInfo(bookingInfo) {
    const totalPrice = document.getElementById("total-price");
    attractionImage.src = bookingInfo.attraction.image;
    attractionName.textContent = `台北一日遊 ： ${bookingInfo.attraction.name}`;
    BookingDate.textContent = bookingInfo.date;
    BookingTime.textContent =
      bookingInfo.price === 2000
        ? "早上 9 點至下午 1 點"
        : "下午 2 點至晚上 9 點";
    BookingPrice.textContent = `新台幣 ${bookingInfo.price} 元`;
    attractionAddress.textContent = bookingInfo.attraction.address;
    totalPrice.textContent = `總價 ： 新台幣 ${bookingInfo.price} 元`;
  }

  async function deleteBooking() {
    try {
      const response = await fetch("/api/booking", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${storedToken}`,
        },
      });
      if (response.status === 200) {
        const jsonData = await response.json();
        if (!jsonData) {
          throw new Error("無法返回有效回應，刪除預定表單失敗");
        }
        window.location.href = "/booking";
      } else if (response.status === 403) {
        throw new Error("未登入系統，拒絕存取");
      } else {
        throw new Error(`HTTP 狀態碼錯誤, status = ${response.status}`);
      }
    } catch (error) {
      console.error("操作刪除失敗或渲染切換失敗等錯誤發生:", error.message);
    }
  }

  /*  下訂*/
  //  即時驗證，欄位-信用卡以外<input>
  ordererPhone.addEventListener("input", validatePhone);
  function validatePhone(event) {
    const input = event.target;
    let value = input.value.replace(/\D/g, "");
    if (value.length > 10) {
      value = value.substring(0, 10);
    }
    input.value = value;
  }

  //  串接TapPay的混用套件寫法: 提交前的3操作方法
  async function setupTapPay() {
    const APP_ID = 151712;
    const APP_KEY =
      "app_X1RrtMgPp3fIbxvcvrxto5tIShQrBnOm78O9HudHZ2cNMgEwV6kY7mxs45XF";
    //  s1.驗證+設定 伺服器方法
    //  微調，改先用變數儲值
    await TPDirect.setupSDK(APP_ID, APP_KEY, "sandbox");
    //  s2.設定  輸入信用卡資訊的輸入欄位方法(4屬性:placeholder + 樣式 +遮蔽卡號與否+遮方)
    //  微調，改fields屬性逕寫入實值
    await TPDirect.card.setup({
      fields: {
        number: {
          element: document.getElementById("card-number"),
          placeholder: "**** **** **** ****",
        },
        expirationDate: {
          element: document.getElementById("card-expiration-date"),
          placeholder: "MM / YY",
        },
        ccv: {
          element: document.getElementById("card-ccv"),
          placeholder: "ccv",
        },
      },
      styles: {
        input: {
          color: "gray",
        },
        "input.ccv": {
          "font-size": "16px",
        },
        "input.expiration-date": {
          "font-size": "16px",
        },
        "input.card-number": {
          "font-size": "16px",
        },
        ":focus": {
          color: "black",
        },
        ".valid": {
          color: "green",
        },
        ".invalid": {
          color: "red",
        },
        "@media screen and (max-width: 400px)": {
          input: {
            color: "orange",
          },
        },
      },
      isMaskCreditCardNumber: true,
      maskCreditCardNumberRange: {
        beginIndex: 6,
        endIndex: 11,
      },
    });
    //  s3.驗證輸入資訊+UI提示方法
    TPDirect.card.onUpdate(function (update) {
      //  多欄位使用同操作邏輯 (同操作邏輯->定義1整體函式，參數傳入各種實際值 如<input>id、狀態碼)
      setFormGroupStatus("card-number", update.status.number);
      setFormGroupStatus("card-expiration-date", update.status.expiry);
      setFormGroupStatus("card-ccv", update.status.ccv);
    });
  }
  function setFormGroupStatus(elementId, status) {
    let element = document.getElementById(elementId);
    if (status === 2) {
      element.classList.add("invalid"); // 值紅色
      element.classList.remove("valid");
    } else if (status === 0) {
      element.classList.add("valid"); // 值綠色
      element.classList.remove("invalid");
    } else {
      element.classList.remove("invalid", "valid"); // 恢復原始值
    }
  }

  //  處理提交表單，含串接TapPay的取得Prime方法
  async function submitOrder(event) {
    event.preventDefault();
    //  s1.再次驗證全部輸入欄位均填寫
    if (!validateOrderInputs()) {
      alert("請將訂單完整填寫後再提交!");
      return;
    }

    try {
      //  s2.TapPay串接
      const prime = await getTapPayPrime();
      const order = await getOrder(bookingInformation); // 記得仍傳入參數
      //  s3.POST請求方式call API
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${storedToken}`,
        },
        body: JSON.stringify({ prime: prime, order: order }),
      });
      const JSONdata = await response.json();

      if (response.status === 200) {
        //  確認資料刪除? 逕(o)重載頁window.location.href = "/booking";  (x)重接收函 fetchBookingInfo();
        window.location.href = `/thankyou?number=${JSONdata.data.number}`;
      } else if (response.status === 400) {
        throw new Error("下訂失敗!請輸入正確格式!");
      } else {
        throw new Error("下訂發生未知錯誤，請稍後再試!");
      }
    } catch (error) {
      alert(error.message);
    }
  }
  orderButton.addEventListener("click", submitOrder);

  //  驗證無空欄
  function validateOrderInputs() {
    let allFilled = true;
    orderInputs.forEach((input) => {
      if (!input.value.trim()) {
        allFilled = false;
      }
    });
    return allFilled;
  }
  //  取得request body的值
  function getTapPayPrime() {
    const tappayStatus = TPDirect.card.getTappayFieldsStatus();
    //  若未寫返回 promise ，無法正確等待 prime 取得
    return new Promise((resolve, reject) => {
      if (tappayStatus.canGetPrime === false) {
        reject("無法取得付款的交易prime!");
        return;
      }
      TPDirect.card.getPrime((result) => {
        if (result.status !== 0) {
          reject("取得付款的交易prime發生錯誤:" + result.msg);
          return;
        }
        console.log("成功取得付款的交易prime!，prime: " + result.card.prime);
        resolve(result.card.prime);
      });
    });
  }
  function getOrder(bookingInfo) {
    const price = bookingInfo.price;
    const trip = {
      attraction: {
        id: bookingInfo.attraction.id,
        name: bookingInfo.attraction.name,
        address: bookingInfo.attraction.address,
        image: bookingInfo.attraction.image,
      },
      date: bookingInfo.date,
      time: bookingInfo.time,
    };
    const contact = {
      name: document.getElementById("name").value,
      email: document.getElementById("email").value,
      phone: document.getElementById("phone").value,
    };
    return {
      price: price,
      trip: trip,
      contact: contact,
    };
  }

  fetchBookingInfo();
  setupTapPay();
});
//  調整本檔跟TapPay<iframe>間css屬性衝突
window.onload = function () {
  let iframes = document.querySelectorAll("iframe");
  iframes.forEach(function (iframe) {
    iframe.style.float = "none";
  });
};
