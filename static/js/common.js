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
        //         指定位置的<footer> (前提:已取得<main>跟<footer>節點資料 ->
        const main = document.getElementById('main');
        const footer = doc.querySelector('.l-footer');  // 取得文檔來源: (o)僅可用DOMParser 解析的 HTML 檔 (x)document目前頁面主檔 //避免和其他頁面檔案有 ID 衝突
        if (main && footer) {   
          main.parentNode.insertBefore(footer, main.nextSibling);
          emitFooterReady();  // 呼叫 自定義事件
        } else {
          console.error('<footer> 未正確插入指定位置');
        }
         
        //考量 限制條件:  欲操作元素節點已建立，才執行函式
        const modalDOMs = {
          signinButton: document.getElementById('signinButton'),
          signupButton: document.getElementById('signupButton'),
          modalBackdrop: document.getElementById('modalBackdrop'), 
          modalSignin: document.getElementById('modalSignin'),
          modalSignup: document.getElementById('modalSignup'),
          formCloses: document.querySelectorAll('.m-memberForm-close') 
        };
        if (modalDOMs.signinButton && modalDOMs.signupButton) { 
          handleMemberAuth(modalDOMs);
        } else {
          console.error("未正確處理會員表單相關DOM");
        }
      })
      .catch(error => {
        console.error('未正確加載common.html:', error);
      });
  });
  function emitFooterReady() {
    document.dispatchEvent(new CustomEvent('footerReady'));
  }

  /*表單*/  
  function handleMemberAuth(modalDOMs) {
    modalDOMs.signinButton.addEventListener('click', function(event) {
      modalDOMs.modalBackdrop.style.display = 'flex';
      modalDOMs.modalSignin.style.display = 'flex';
      modalDOMs.modalSignup.style.display = 'none';
    });

    modalDOMs.signupButton.addEventListener('click', function(event) {
      modalDOMs.modalBackdrop.style.display = 'flex';
      modalDOMs.modalSignup.style.display = 'flex';
      modalDOMs.modalSignin.style.display = 'none';
    });
    
    modalDOMs.formCloses.forEach(button => {
    button.addEventListener('click', function(event) {
      modalDOMs.modalBackdrop.style.display = 'none';
      modalDOMs.modalSignin.style.display = 'none';
      modalDOMs.modalSignup.style.display = 'none';
      });
    });
}
