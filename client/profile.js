async function load() {
  const res = await fetch("/me");

  if (!res.ok) {
    window.location = "/";
    return;
  }

  const user = await res.json();

  username.value = user.username || "";
  bio.value = user.bio || "";

  if (user.role === "mod") {
    modBadge.classList.remove("hidden");
  }
}

async function save() {
  await fetch("/update-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: username.value,
      bio: bio.value
    })
  });

  alert("Guardado ✅");
}

load();
