// Placeholder until milestone A: proves the round trip browser → server → database.
export {};
interface Save {
  version: 1;
  runs: number;
}

const runsEl = document.querySelector<HTMLOutputElement>("#runs")!;
const button = document.querySelector<HTMLButtonElement>("#run")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;

async function load(): Promise<Save> {
  const res = await fetch("api/save");
  if (res.status === 404) return { version: 1, runs: 0 };
  if (!res.ok) throw new Error(`load failed: ${res.status}`);
  return (await res.json()) as Save;
}

async function store(save: Save): Promise<void> {
  const res = await fetch("api/save", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(save),
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
}

let save: Save;
try {
  save = await load();
  runsEl.value = String(save.runs);
  button.disabled = false;
} catch (err) {
  status.textContent = String(err);
}

button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    const next = { ...save, runs: save.runs + 1 };
    await store(next);
    save = next;
    runsEl.value = String(save.runs);
    status.textContent = "gespeichert";
  } catch (err) {
    status.textContent = String(err);
  } finally {
    button.disabled = false;
  }
});
