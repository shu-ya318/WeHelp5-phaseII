//全域變數，減少對 localStorage 的取值操作次數+統一管理值更新
let storedToken = localStorage.getItem('token');  

document.addEventListener('DOMContentLoaded', function() {
  fetch('/static/common.html')
      .then(response => response.text())     
      .then(data => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');
        const commonContainer = document.getElementById('common-container');
    
        //動態載入  位置依序的<元素們>
        Array.from(doc.body.children).forEach(node => {
          if (node.tagName !== 'FOOTER') {
            commonContainer.appendChild(node.cloneNode(true));
          }
        });
        //         指定位置的<footer>
        const mainElement = document.getElementById('main');
        const footerElement = doc.querySelector('.l-footer');  // 取得文檔來源: (o)僅可用DOMParser 解析的 HTML 檔 (x)document目前頁面主檔 //避免和其他頁面檔案有 ID 衝突
        if (mainElement && footerElement) {   
          mainElement.parentNode.insertBefore(footerElement, mainElement.nextSibling);
          //自定義事件，序:DOM建立後立即定義
          document.dispatchEvent(new CustomEvent('footerReady'));
        } else {
          console.error('<footer> 未正確插入指定位置');
        }
        setupUserAuth();  
      })
      .catch(error => {
        console.error('未正確加載common.html:', error);
      });
  });
  /*會員驗證->封裝所有元素DOM+關聯函式放父函式，頁面載完立即執行初始化*/
  function setupUserAuth() {
  const modalElements = getModalElements(); 
  //先寫只負責切換狀態功能:點右上超連結、點表單切換超連結、點表單x按鈕
  modalElements.signupLink.addEventListener('click', () => showModalSignup(modalElements));
  modalElements.signinLink.addEventListener('click', () => showModalSignin(modalElements));
  modalElements.turnSignin.addEventListener('click', () => showModalSignin(modalElements));
  modalElements.turnSignup.addEventListener('click', () => showModalSignup(modalElements));
  modalElements.closeButtons.forEach(button => {
    button.addEventListener('click', () => closeModals(modalElements));
  });
  //再寫表單提交功能 (非用預設提交,不寫submit事件)
  modalElements.signupButton.addEventListener('click', (event) => handleSignup(event,modalElements));
  modalElements.signinButton.addEventListener('click', (event) => handleSignin(event,modalElements));
  //預定
  modalElements.bookingLink.addEventListener('click', () => handleBooking(modalElements));
  //登出
  if (modalElements.signoutLink) {
    modalElements.signoutLink.addEventListener('click', () => {
      localStorage.removeItem('token'); 
      location.reload(); 
    });
  }
  //確認憑證狀態
  checkTokenAndHandle(modalElements); 
}

//靈活處理封裝物件的DOM
function getModalElements() {
  return {
    //<nav>連結父子元素
    showAuth: document.getElementById('show-auth'),
    showSignout: document.getElementById('show-signout'),
    signupLink: document.getElementById('signup-link'),
    signinLink: document.getElementById('signin-link'),
    signoutLink: document.getElementById('signout-link'),
    bookingLink: document.getElementById('booking-link'),
    //彈出表單+背景
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalSignup: document.getElementById('modalSignup'),
    turnSignin:document.getElementById('turn-signin'),
    signupName: document.getElementById('signup-name'),
    signupEmail: document.getElementById('signup-email'),
    signupPassword: document.getElementById('signup-password'),
    signupButton: document.getElementById('signup-button'),
    signupAuth:document.getElementById('signup-auth'),
    modalSignin: document.getElementById('modalSignin'),
    turnSignup:document.getElementById('turn-signup'),
    signinEmail: document.getElementById('signin-email'),
    signinPassword: document.getElementById('signin-password'),
    signinButton: document.getElementById('signin-button'),
    signinAuth: document.getElementById('signin-auth'),
    closeButtons: document.querySelectorAll('.m-memberForm-close')
  };
}
//切換狀態顯隱
function showModalSignup(modalElements) {
  modalElements.modalBackdrop.style.display = 'flex';
  modalElements.modalSignin.style.display = 'none';
  modalElements.signupAuth.style.display='none';
  modalElements.modalSignup.style.display = 'flex';
}
function showModalSignin(modalElements) {
  modalElements.modalBackdrop.style.display = 'flex';
  modalElements.modalSignup.style.display = 'none';
  modalElements.signinAuth.style.display='none';
  modalElements.modalSignin.style.display = 'flex';
}   
//表單x按鈕關閉
function closeModals(modalElements) {
  modalElements.modalBackdrop.style.display = 'none';
  modalElements.modalSignup.style.display = 'none';
  modalElements.modalSignin.style.display = 'none';
}
//表單提交call API
function handleSignup(event,modalElements) {
  event.preventDefault();
  const { signupName, signupEmail, signupPassword, signupAuth } = modalElements;
  const name = signupName.value.trim();
  const email = signupEmail.value.trim();
  const password = signupPassword.value.trim();
  if (!name || !email || !password) {
    signupAuth.style.display = 'block';
    signupAuth.style.color = 'red';
    signupAuth.textContent = '欄位不可空白。';
    return;
  }

  const requestBody = {
    name: name,
    email: email,
    password: password,
  };
  fetch('/api/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  //接收結果，依不同HTTP status對應不同渲染
  .then(response => response.json().then(data => ({ status: response.status, body: data })))
  .then(({ status, body }) => {  
    if (status === 200) {
      signupAuth.style.display = 'block';
      signupAuth.style.color = 'green';
      signupAuth.textContent = '註冊成功，請登入系統';
      //清空欄位: 字串->基本型別傳值特性，(x)賦值新變數=" "  
      signupName.value = "";
      signupEmail.value = "";
      signupPassword.value = "";
    } else if (status === 400) {
      throw new Error('Email已經註冊帳戶');
    } else {
      throw new Error('註冊發生未知錯誤，請稍後再試');
    }
  })
  .catch(error => {
    signupAuth.style.display = 'block';
    signupAuth.style.color = 'red';
    signupAuth.textContent = error.message;
  });
}
function handleSignin(event,modalElements) {
  event.preventDefault();
  const { signinEmail, signinPassword, signinAuth} = modalElements;
  const email = signinEmail.value.trim();
  const password = signinPassword.value.trim();
  if (!email || !password) {
    signinAuth.style.display = 'block';
    signinAuth.style.color = 'red';
    signinAuth.textContent = '欄位不可空白。';
    return;
  }

  const requestBody = {
    email: email,
    password: password,
  };
  fetch('/api/user/auth', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
  .then(response => response.json().then(data => ({ status: response.status, body: data })))
  .then(({ status, body }) => {
    if (status === 200) {
      localStorage.setItem('token', body.token);
      checkTokenAndHandle(modalElements); //登入成功即更新權限，以免舊UI誤認未登入
      location.reload(); 
    } else if (status === 400) {
      throw new Error('電子郵件或密碼錯誤');
    } else {
      throw new Error('登入發生未知錯誤，請稍後再試');
    }
  })
  .catch(error => {
    signinAuth.style.display='block';
    signinAuth.style.color = 'red';
    signinAuth.textContent = error.message;
  });
}
//預定行程
function handleBooking(modalElements){
  if (!storedToken) {                     //用憑證判斷,非前端登出系統連結UI
    showModalSignin(modalElements);
    return;
  }
  window.location.href = "/booking";
}
//確認憑證狀態by是否取得當前用戶資料 (定義1次，供初始化+特定操作後ex signin呼叫)
//即時權限驗證:取得當前登入用戶資訊函式->作用:空值與否，驗證訪問權限有無 (目前未對資料操作渲染)
function checkTokenAndHandle(modalElements) { 
  storedToken = localStorage.getItem('token');   // 每次都先重取值，確保必最新 
  const pathSegment = window.location.pathname.split('/');
  const authorizedPage = pathSegment[pathSegment.length - 1];
  //開始請求
  fetch('/api/user/auth', 
    { method: 'GET', 
      headers: { 
        'Content-Type': 'application/json' ,
        'Authorization': `Bearer ${storedToken}` 
      }
    })
  .then(response => {
    return response.json(); 
  })
  .then(JSONdata => {
    if (!JSONdata||!storedToken){  // 後端檢查token無效、逾期失效 或 前端本地token未儲存 (ex登出、清空)
      modalElements.showSignout.style.display = 'none';
      modalElements.showAuth.style.display = 'flex';
      if(authorizedPage === "booking" || authorizedPage === "thankyou"){   //已含子頁
        window.location.href = "/";
      }
    }else {
    modalElements.showAuth.style.display = 'none';
    modalElements.showSignout.style.display = 'flex';
    const ordererName = document.getElementById('name');
    const ordererEmail = document.getElementById('email');
      if(authorizedPage === "booking"){ 
        const UserName = document.getElementById('username-trip');
        UserName.textContent =`您好，${JSONdata.data.name}，待預訂的行程如下：`;
        ordererName.value =  JSONdata.data.name;
        ordererEmail.value =  JSONdata.data.email ;
      }
    }
  })
  .catch(error => console.error('處理接收token值發生錯誤', error));
} 
