// --- FIREBASE AYARLARI ---
const firebaseConfig = {
  apiKey: "AIzaSyCD_dKXan4yjAzxqLc8Yfjx4JzXNne45Lk",
  authDomain: "zamankaps.firebaseapp.com",
  projectId: "zamankaps",
  storageBucket: "zamankaps.firebasestorage.app",
  messagingSenderId: "167594541047",
  appId: "1:167594541047:web:b61c2ba198c07c69c8b8f2",
  measurementId: "G-268PLLLDRD"
};

// Firebase'i Başlat
// Not: HTML'de "compat" kütüphanelerini kullandığın için bu yazım şekli doğrudur.
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// --- DEĞİŞKENLER VE DOM ---
let currentUser = null;
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const capsuleList = document.getElementById('capsule-list');

// --- AUTH İŞLEMLERİ ---

// Giriş Durumunu İzle
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        document.getElementById('display-username').innerText = user.displayName || user.email;
        loadCapsules(); // Kapsülleri yükle
    } else {
        currentUser = null;
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});

function login() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    if(!email || !pass) return showError("auth-error", "Lütfen tüm alanları doldurun.");

    auth.signInWithEmailAndPassword(email, pass)
        .catch(error => showError("auth-error", "Giriş hatası: " + error.message));
}

function register() {
    const userDisplay = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-password').value;

    if(!userDisplay || !email || !pass) return showError("auth-error", "Boş alan bırakmayınız.");
    if(pass.length < 6) return showError("auth-error", "Şifre en az 6 karakter olmalı.");

    auth.createUserWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            // Kullanıcı adını güncelle
            return userCredential.user.updateProfile({
                displayName: userDisplay
            });
        })
        .then(() => {
            alert("Hesap oluşturuldu! Giriş yapılıyor...");
        })
        .catch(error => showError("auth-error", error.message));
}

function logout() {
    auth.signOut();
}

// --- ARAYÜZ FONKSİYONLARI ---
function showRegister() { loginForm.style.display = 'none'; registerForm.style.display = 'block'; }
function showLogin() { loginForm.style.display = 'block'; registerForm.style.display = 'none'; }
function showError(elementId, msg) { 
    const el = document.getElementById(elementId);
    if(el) {
        el.innerText = msg;
        setTimeout(() => el.innerText = "", 5000);
    }
}

// --- KAPSÜL İŞLEMLERİ ---
function openCreateModal() { 
    document.getElementById('create-modal').classList.remove('hidden'); 
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('capsule-date').min = now.toISOString().slice(0,16);
}

function closeCreateModal() { document.getElementById('create-modal').classList.add('hidden'); }

async function saveCapsule() {
    const text = document.getElementById('capsule-text').value;
    const dateInput = document.getElementById('capsule-date').value;
    const imageFile = document.getElementById('capsule-image').files[0];

    if (!text && !imageFile) return showError("modal-error", "Kapsül boş olamaz.");
    if (!dateInput) return showError("modal-error", "Lütfen açılma zamanını seç.");

    const openDate = new Date(dateInput);
    const now = new Date();
    if (openDate <= now) return showError("modal-error", "Zaman kapsülü gelecekte açılmalıdır!");

    const saveBtn = document.querySelector('.save-btn');
    saveBtn.innerText = "Yükleniyor...";
    saveBtn.disabled = true;

    try {
        let imageUrl = null;
        
        if (imageFile) {
            const storageRef = storage.ref(`capsules/${currentUser.uid}/${Date.now()}_${imageFile.name}`);
            await storageRef.put(imageFile);
            imageUrl = await storageRef.getDownloadURL();
        }

        await db.collection('capsules').add({
            userId: currentUser.uid,
            text: text,
            imageUrl: imageUrl,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            openDate: firebase.firestore.Timestamp.fromDate(openDate),
            isOpened: false
        });

        closeCreateModal();
        document.getElementById('capsule-text').value = "";
        document.getElementById('capsule-image').value = "";
        alert("Kapsülün başarıyla gömüldü! ⏳");
        loadCapsules();

    } catch (error) {
        showError("modal-error", "Hata: " + error.message);
    } finally {
        saveBtn.innerText = "Zamanı Kilitle ve Sakla 🔒";
        saveBtn.disabled = false;
    }
}

function loadCapsules() {
    capsuleList.innerHTML = '<div class="empty-state">Yükleniyor...</div>';
    
    db.collection('capsules')
        .where("userId", "==", currentUser.uid)
        .orderBy("openDate", "asc")
        .get()
        .then((querySnapshot) => {
            capsuleList.innerHTML = "";
            if(querySnapshot.empty) {
                capsuleList.innerHTML = '<div class="empty-state">Henüz hiç kapsülün yok. 🚀</div>';
                return;
            }

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const openDate = data.openDate.toDate();
                const now = new Date();
                const isLocked = now < openDate;

                let contentHtml = '';
                
                if (isLocked) {
                    const timeLeft = getTimeRemaining(now, openDate);
                    contentHtml = `
                        <div class="capsule-card locked">
                            <div class="capsule-header">
                                <span>🔒 Kilitli Kapsül</span>
                                <span>Açılma: ${openDate.toLocaleString()}</span>
                            </div>
                            <div class="locked-msg">
                                <i class="fas fa-hourglass-half"></i>
                                Bu kapsül henüz açılamaz.<br>Kalan süre: ${timeLeft}
                            </div>
                        </div>
                    `;
                } else {
                    contentHtml = `
                        <div class="capsule-card">
                            <div class="capsule-header">
                                <span style="color:var(--primary)">🔓 Kapsül Açıldı!</span>
                                <span>${openDate.toLocaleDateString()}</span>
                            </div>
                            <div class="capsule-body">${data.text || ''}</div>
                            ${data.imageUrl ? `<img src="${data.imageUrl}" class="capsule-img" onclick="window.open(this.src)">` : ''}
                        </div>
                    `;
                }
                capsuleList.innerHTML += contentHtml;
            });
        })
        .catch(err => {
            console.error("Veri çekme hatası: ", err);
            capsuleList.innerHTML = '<div class="error-msg">Veriler yüklenemedi.</div>';
        });
}

function getTimeRemaining(now, target) {
    const diff = target - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days} gün ${hours} saat`;
    if (hours > 0) return `${hours} saat ${minutes} dakika`;
    return `${minutes} dakika`;
}
