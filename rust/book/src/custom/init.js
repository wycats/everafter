mermaid.init({
  startOnLoad: true,
  securityLevel: "loose",
  theme: "forest",
  flowchart: {
    htmlLabels: true,
  },
  sequence: {
    noteAlign: "center",
  },
});

document.addEventListener("click", e => {
  let existing = document.querySelector(".popover");

  let link = e.target;
  if (link && link.matches("a.jump")) {
    existing.remove();
  } else if (link && link.matches("a[href^='#']:not([id])")) {
    e.preventDefault();

    let existing = document.querySelector(".popover");

    if (link.contains(existing)) {
      existing.remove();
      return;
    } else if (existing) {
      existing.remove();
    }

    let targetName = link.href.split("#")[1];
    let target = document.querySelector(`[name="${targetName}"]`);
    let node = target.parentNode.cloneNode(true);
    let div = document.createElement("div");
    div.classList.add("popover");

    let parentRect = link.parentNode.getBoundingClientRect();

    let width = parentRect.width * 0.8;
    div.style.width = `${width}px`;
    div.style.left = `${parentRect.width * 0.07}px`;
    div.appendChild(node);

    let tmp = document.createElement("template");
    tmp.innerHTML = `<p><a class="jump" href="${link.href}">Jump</a></p>`;
    div.appendChild(tmp.content);

    link.appendChild(div);
  } else if (existing) {
    e.preventDefault();
    existing.remove();
  }
});
