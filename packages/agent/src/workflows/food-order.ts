import type { WorkflowInputs, WorkflowMode } from "@cua/core";
import type { WorkflowDefinition, WorkflowStartPlan } from "./types.js";

const DEFAULT_REAL_START_URL = "https://www.ubereats.com/";

export const foodOrderWorkflow: WorkflowDefinition = {
  id: "food-order",
  title: "Food ordering demo",
  description:
    "Search an Uber Eats-style fixture, compare menu options, build a fake cart, and pause before checkout.",
  modes: ["fixture", "browse", "real"],
  defaultMode: "fixture",
  inputFields: [
    {
      name: "cuisine",
      label: "Cuisine",
      kind: "text",
      required: true,
      defaultValue: "thai",
      placeholder: "thai",
    },
    {
      name: "budget",
      label: "Budget",
      kind: "number",
      defaultValue: 30,
      description: "Approximate pre-tax budget in dollars.",
    },
    {
      name: "servings",
      label: "Servings",
      kind: "number",
      defaultValue: 2,
    },
    {
      name: "dietaryNotes",
      label: "Dietary notes",
      kind: "textarea",
      defaultValue: "",
      placeholder: "vegetarian, spicy, avoid peanuts",
    },
    {
      name: "mustHave",
      label: "Must have",
      kind: "text",
      defaultValue: "",
      placeholder: "noodles, soup, dumplings",
    },
    {
      name: "avoid",
      label: "Avoid",
      kind: "text",
      defaultValue: "",
      placeholder: "seafood, dairy",
    },
    {
      name: "maxEtaMinutes",
      label: "Max ETA minutes",
      kind: "number",
      defaultValue: 45,
    },
    {
      name: "startUrl",
      label: "Real/browse start URL",
      kind: "text",
      defaultValue: DEFAULT_REAL_START_URL,
      description: "Used only for browse or real mode.",
    },
  ],
  createStart(options): WorkflowStartPlan {
    const inputs = normalizeFoodInputs(options.inputs);
    const startUrl =
      options.mode === "fixture"
        ? fixtureDataUrl()
        : String(inputs.startUrl || DEFAULT_REAL_START_URL);
    const target = options.mode === "fixture" ? "fixture://food-order" : startUrl;
    const policy = policyForMode(options.mode, inputs);

    return {
      startUrl,
      task: buildFoodOrderTask(options.mode, inputs, target),
      metadata: {
        id: "food-order",
        title: "Food ordering demo",
        mode: options.mode,
        inputs: sanitizeInputs(inputs),
        target,
        policy,
        checkpoints: [],
      },
    };
  },
  fixtureHtml: foodOrderFixtureHtml,
  policyForMode,
};

function normalizeFoodInputs(inputs: WorkflowInputs): WorkflowInputs {
  return {
    cuisine: stringInput(inputs.cuisine, "thai"),
    budget: numberInput(inputs.budget, 30),
    servings: numberInput(inputs.servings, 2),
    dietaryNotes: stringInput(inputs.dietaryNotes, ""),
    mustHave: stringInput(inputs.mustHave, ""),
    avoid: stringInput(inputs.avoid, ""),
    maxEtaMinutes: numberInput(inputs.maxEtaMinutes, 45),
    startUrl: stringInput(inputs.startUrl, DEFAULT_REAL_START_URL),
  };
}

function buildFoodOrderTask(
  mode: WorkflowMode,
  inputs: WorkflowInputs,
  target: string,
): string {
  return [
    "[workflow:food-order]",
    `Mode: ${mode}`,
    `Start target: ${target}`,
    "",
    "Goal: use the browser to find a meal option that matches the user's constraints.",
    `Cuisine: ${inputs.cuisine}`,
    `Budget: ${inputs.budget}`,
    `Servings: ${inputs.servings}`,
    `Dietary notes: ${inputs.dietaryNotes || "none"}`,
    `Must have: ${inputs.mustHave || "none"}`,
    `Avoid: ${inputs.avoid || "none"}`,
    `Max ETA minutes: ${inputs.maxEtaMinutes}`,
    "",
    "If the fixture page is open, search and compare the fake restaurants, add a sensible fake cart, then stop at the review/checkout step unless the harness asks for approval.",
    "If this is a real or browse-mode website, do not log in, do not enter personal information, do not place an order, and stop before checkout, payment, or final submit.",
    "When done, summarize the selected option and why it fits.",
  ].join("\n");
}

function sanitizeInputs(inputs: WorkflowInputs): WorkflowInputs {
  return Object.fromEntries(
    Object.entries(inputs).filter(([key]) => key !== "startUrl"),
  ) as WorkflowInputs;
}

function policyForMode(mode: WorkflowMode, inputs: WorkflowInputs) {
  if (mode === "fixture") {
    return undefined;
  }

  const domain = domainForUrl(String(inputs.startUrl || DEFAULT_REAL_START_URL));

  return domain ? { allowDomains: [domain] } : undefined;
}

function fixtureDataUrl(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(foodOrderFixtureHtml())}`;
}

function foodOrderFixtureHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Food ordering fixture</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #fff8ed; color: #231f20; }
      header { padding: 28px 32px; background: #14342b; color: white; }
      main { display: grid; gap: 24px; padding: 28px 32px; }
      .search, .card, .cart { border: 2px solid #231f20; border-radius: 14px; background: white; padding: 18px; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(190px, 1fr)); gap: 16px; }
      input, button { border: 2px solid #231f20; border-radius: 10px; font: inherit; padding: 12px 14px; }
      button { background: #ffb000; cursor: pointer; font-weight: 800; }
      button.secondary { background: #ffffff; }
      .menu { display: none; margin-top: 14px; padding-top: 14px; border-top: 1px solid #ddd; }
      .menu.active { display: grid; gap: 10px; }
      .item { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .cart { position: sticky; bottom: 16px; box-shadow: 0 12px 24px rgba(0,0,0,0.15); }
      .review { display: none; border: 2px dashed #14342b; border-radius: 14px; padding: 18px; }
      .review.active { display: block; }
      .muted { color: #665f5a; }
    </style>
  </head>
  <body>
    <header>
      <p class="muted" style="color:#cde7dc;margin:0 0 8px;">Local fixture - no real orders</p>
      <h1>Food ordering fixture</h1>
      <p>Search fake restaurants, build a fake cart, and stop before fake checkout.</p>
    </header>
    <main>
      <section class="search">
        <label for="query"><strong>Search cuisine or dish</strong></label>
        <input id="query" aria-label="Search cuisine or dish" placeholder="thai, noodles, vegetarian" />
        <button id="search">Search</button>
      </section>
      <section class="grid" aria-label="Restaurant results">
        <article class="card" data-cuisine="thai noodles spicy">
          <h2>Lemongrass Lab</h2>
          <p>Thai noodles, curry, bright salads. 28-38 min. $$.</p>
          <button class="view-menu" data-menu="lemongrass">View menu</button>
          <div id="lemongrass" class="menu">
            <div class="item"><span>Pad See Ew - $14</span><button data-item="Pad See Ew" data-price="14">Add</button></div>
            <div class="item"><span>Green Curry - $16</span><button data-item="Green Curry" data-price="16">Add</button></div>
            <div class="item"><span>Mango Sticky Rice - $8</span><button data-item="Mango Sticky Rice" data-price="8">Add</button></div>
          </div>
        </article>
        <article class="card" data-cuisine="pizza pasta vegetarian">
          <h2>Marinara Works</h2>
          <p>Pizza, pasta, salads. 25-35 min. $$.</p>
          <button class="view-menu" data-menu="marinara">View menu</button>
          <div id="marinara" class="menu">
            <div class="item"><span>Margherita Pizza - $18</span><button data-item="Margherita Pizza" data-price="18">Add</button></div>
            <div class="item"><span>Rigatoni - $15</span><button data-item="Rigatoni" data-price="15">Add</button></div>
          </div>
        </article>
        <article class="card" data-cuisine="tacos mexican spicy">
          <h2>Taco Foundry</h2>
          <p>Tacos, bowls, aguas frescas. 20-30 min. $.</p>
          <button class="view-menu" data-menu="taco">View menu</button>
          <div id="taco" class="menu">
            <div class="item"><span>Mushroom Tacos - $11</span><button data-item="Mushroom Tacos" data-price="11">Add</button></div>
            <div class="item"><span>Chicken Bowl - $13</span><button data-item="Chicken Bowl" data-price="13">Add</button></div>
          </div>
        </article>
      </section>
      <section class="cart" aria-label="Cart">
        <h2>Fake cart</h2>
        <p id="cart-items">No items yet.</p>
        <p><strong>Total:</strong> $<span id="cart-total">0</span></p>
        <button id="review" class="secondary">Review fake checkout</button>
      </section>
      <section id="checkout" class="review" aria-label="Fake checkout review">
        <h2>Fake checkout review</h2>
        <p>This is a local test page. No payment, delivery, or real restaurant is involved.</p>
        <button id="place-order">Place fake order</button>
        <p id="result" role="status"></p>
      </section>
    </main>
    <script>
      const cart = [];
      const items = document.querySelector("#cart-items");
      const total = document.querySelector("#cart-total");
      document.querySelector("#search").addEventListener("click", () => {
        const query = document.querySelector("#query").value.toLowerCase();
        document.querySelectorAll(".card").forEach((card) => {
          card.style.display = card.dataset.cuisine.includes(query) || !query ? "block" : "none";
        });
      });
      document.querySelectorAll(".view-menu").forEach((button) => {
        button.addEventListener("click", () => {
          document.querySelector("#" + button.dataset.menu).classList.toggle("active");
        });
      });
      document.querySelectorAll("[data-item]").forEach((button) => {
        button.addEventListener("click", () => {
          cart.push({ item: button.dataset.item, price: Number(button.dataset.price) });
          items.textContent = cart.map((entry) => entry.item).join(", ");
          total.textContent = String(cart.reduce((sum, entry) => sum + entry.price, 0));
        });
      });
      document.querySelector("#review").addEventListener("click", () => {
        document.querySelector("#checkout").classList.add("active");
        document.querySelector("#checkout").scrollIntoView({ behavior: "smooth" });
      });
      document.querySelector("#place-order").addEventListener("click", () => {
        document.querySelector("#result").textContent = "Fake order submitted for local testing.";
      });
    </script>
  </body>
</html>`;
}

function stringInput(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberInput(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function domainForUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

