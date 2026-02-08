const inputDisplay = document.getElementById("inputDisplay");
const resultSummary = document.getElementById("resultSummary");
const resultSteps = document.getElementById("resultSteps");
const backButton = document.getElementById("backButton");
const clearButton = document.getElementById("clearButton");

const tokens = [];
const operatorMap = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "×": (a, b) => a * b,
  "÷": (a, b) => a / b,
};

const numberButtons = Array.from(
  document.querySelectorAll("button[data-number]")
);
const operatorButtons = Array.from(
  document.querySelectorAll("button[data-operator]")
);

function updateDisplay() {
  inputDisplay.textContent = tokens.length ? tokens.join(" ") : "None yet";
  updateButtonStates();
  renderResults();
}

function updateButtonStates() {
  const lastToken = tokens[tokens.length - 1];
  const expectingNumber = tokens.length === 0 || typeof lastToken === "string";
  numberButtons.forEach((button) => {
    button.disabled = !expectingNumber;
  });
  operatorButtons.forEach((button) => {
    button.disabled = expectingNumber;
  });
}

function renderResults() {
  resultSteps.innerHTML = "";

  if (tokens.length < 3 || typeof tokens[tokens.length - 1] === "string") {
    resultSummary.textContent =
      "Enter a full expression (number → operator → number) to see the steps.";
    return;
  }

  const { steps, result } = evaluateTokens(tokens);
  if (!steps.length) {
    resultSummary.textContent = "Complete the expression to see the steps.";
    return;
  }

  resultSummary.textContent = `Expression: ${tokens.join(" ")} = ${result}`;
  steps.forEach((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    resultSteps.appendChild(item);
  });
}

function evaluateTokens(inputTokens) {
  const steps = [];
  let currentValue = Number(inputTokens[0]);

  for (let index = 1; index < inputTokens.length; index += 2) {
    const operator = inputTokens[index];
    const nextValue = Number(inputTokens[index + 1]);

    if (!operatorMap[operator]) {
      break;
    }

    const previousValue = currentValue;
    currentValue = operatorMap[operator](currentValue, nextValue);
    steps.push(`${previousValue} ${operator} ${nextValue} = ${currentValue}`);
  }

  return { steps, result: currentValue };
}

numberButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tokens.push(Number(button.dataset.number));
    updateDisplay();
  });
});

operatorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tokens.push(button.dataset.operator);
    updateDisplay();
  });
});

backButton.addEventListener("click", () => {
  tokens.pop();
  updateDisplay();
});

clearButton.addEventListener("click", () => {
  tokens.length = 0;
  updateDisplay();
});

updateDisplay();
