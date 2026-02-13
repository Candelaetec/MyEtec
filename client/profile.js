const username = document.getElementById("username");
const bio = document.getElementById("bio");
const modBadge = document.getElementById("modBadge");

let currentUser = null;

// ------------------
// CARGAR PERFIL
// ------------------
async function load() {
  const res = await fetch("/me");

  if (!res.ok) {
    window.location = "/";
    return;
  }

  const user = await res.json();
  currentUser = user;

  username.value = user.username || "";
  bio.value = user.bio || "";

  // mostrar badge
  if (user.role === "mod" || user.role === "admin") {
    modBadge.classList.remove("hidden");
  }

  // 🔥 SOLO ADMIN/MOD pueden usar HTML real
  if (user.role === "admin" || user.role === "mod") {
    enableCustomHTML();
  }
}

// ------------------
// HABILITAR HTML CUSTOM
// ------------------
function enableCustomHTML() {
  bio.placeholder = "Podés usar HTML/CSS personalizado ✨";

  // preview en vivo
  bio.addEventListener("input", () => {
    let preview = document.getElementById("bioPreview");

    if (!preview) {
      preview = document.createElement("div");
      preview.id = "bioPreview";
      preview.style.marginTop = "15px";
      preview.style.padding = "10px";
      preview.style.border = "2px dashed #e0439c";
      bio.parentNode.appendChild(preview);
    }

    preview.innerHTML = bio.value; // ← renderiza HTML real
  });
}

// ------------------
// GUARDAR
// ------------------
async function save() {
  let content = bio.value;

  // usuarios normales: escapar HTML
  if (currentUser.role !== "admin" && currentUser.role !== "mod") {
    const div = document.createElement("div");
    div.textContent = content;
    content = div.innerHTML;
  }

  await fetch("/update-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: username.value,
      bio: content
    })
  });

  alert("Guardado ✅");
}

load();
