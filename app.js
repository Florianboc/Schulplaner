// Supabase
const supabaseClient = supabase.createClient(
    "https://pfussewqhvxaflwxrkey.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmdXNzZXdxaHZ4YWZsd3hya2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODMwMzAsImV4cCI6MjA4MDY1OTAzMH0.X3QhVjTyKU9OuKShXSb4Lemw2985AN_h8TUW62R-amQ"
);

// UI-Elemente
const email = document.getElementById("email");
const password = document.getElementById("password");
const nameField = document.getElementById("name");
const msg = document.getElementById("msg");

let signupMode = false;

// Umschalten zwischen Login <-> Registrierung
document.getElementById("toggle-signup-btn").onclick = () => {
    signupMode = !signupMode;

    if (signupMode) {
        nameField.style.display = "block";
        document.getElementById("toggle-signup-btn").innerText = "Zum Login";
        document.getElementById("login-btn").innerText = "Registrieren";
        msg.innerText = "";
    } else {
        nameField.style.display = "none";
        document.getElementById("toggle-signup-btn").innerText = "Registrieren";
        document.getElementById("login-btn").innerText = "Login";
        msg.innerText = "";
    }
};

// Login / Registrierung
document.getElementById("login-btn").onclick = async () => {
    msg.innerText = "";

    if (signupMode) {
        await signup();
    } else {
        await login();
    }
};

async function signup() {
    const name = nameField.value.trim();
    const mail = email.value.trim();
    const pass = password.value;

    if (!name) {
        msg.innerText = "Bitte vollständigen Namen eingeben.";
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
        email: mail,
        password: pass
    });

    if (error) {
        msg.innerText = error.message;
        return;
    }

    const userId = data.user.id;

    // Name ins Profil speichern
    await supabaseClient.from("profiles").insert({
        id: userId,
        name: name
    });

    msg.innerText = "Registrierung erfolgreich! Bitte bestätige deine E-Mail.";

    // Hinweistext EINBLENDEN
    document.getElementById("email-confirm-info").style.display = "block";

    // Zurück in Login-Modus wechseln
    signupMode = false;
    nameField.style.display = "none";
}

async function login() {
    const { error } = await supabaseClient.auth.signInWithPassword({
        email: email.value.trim(),
        password: password.value
    });

    if (error) {
        msg.innerText = "Login fehlgeschlagen.";
        return;
    }

    window.location = "dashboard.html";
}
