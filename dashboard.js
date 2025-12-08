// =======================
//   Supabase Config
// =======================
const SUPABASE_URL = "https://pfussewqhvxaflwxrkey.supabase.co";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmdXNzZXdxaHZ4YWZsd3hya2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODMwMzAsImV4cCI6MjA4MDY1OTAzMH0.X3QhVjTyKU9OuKShXSb4Lemw2985AN_h8TUW62R-amQ";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// =======================
//   Session prüfen
// =======================
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location = "index.html";
        return;
    }

    loadGroups(session.user.id);
}

checkSession();


// =======================
//   Gruppen laden
// =======================
async function loadGroups(userId) {
    const { data, error } = await supabaseClient
        .from("group_members")
        .select("groups(id, name, join_code)")
        .eq("user_id", userId);

    const list = document.getElementById("group-list"); // FIXED ID

    if (error) {
        list.innerHTML = "<p>Fehler beim Laden der Gruppen!</p>";
        return;
    }

    if (!data || data.length === 0) {
        list.innerHTML = "<p>Du bist noch in keiner Gruppe.</p>";
        return;
    }

    list.innerHTML = data
        .map(item => `
            <li>
                <a href="group.html?id=${item.groups.id}">
                    ${item.groups.name}
                </a>
            </li>
        `)
        .join("");
}


// =======================
//   Neue Gruppe erstellen
// =======================
document.getElementById("create-group-btn").addEventListener("click", async () => {

    const name = document.getElementById("new-group-name").value; // FIXED ID

    if (name.trim() === "") {
        alert("Bitte einen Gruppennamen eingeben!");
        return;
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: { session } } = await supabaseClient.auth.getSession();

    const { data: group, error } = await supabaseClient
        .from("groups")
        .insert({
            name: name,
            join_code: code,
            created_by: session.user.id
        })
        .select()
        .single();

    if (error) {
        alert("Fehler: " + error.message);
        return;
    }

    // Benutzer als Owner hinzufügen
    await supabaseClient.from("group_members").insert({
        group_id: group.id,
        user_id: session.user.id,
        role: "owner"
    });

    location.reload();
});


// =======================
//   Gruppe beitreten
// =======================
document.getElementById("join-group-btn").addEventListener("click", async () => {

    const code = document.getElementById("join-code").value.trim();

    if (code === "") {
        alert("Bitte einen Beitrittscode eingeben!");
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    const { data: group } = await supabaseClient
        .from("groups")
        .select("*")
        .eq("join_code", code)
        .maybeSingle();

    if (!group) {
        alert("Der Code ist ungültig.");
        return;
    }

    await supabaseClient.from("group_members").insert({
        group_id: group.id,
        user_id: session.user.id
    });

    location.reload();
});


// =======================
//   Logout
// =======================
document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location = "index.html";
});
