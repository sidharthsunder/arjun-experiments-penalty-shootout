const groups = {
    A: ["Mexico", "Germany", "Senegal", "Japan"],
    B: ["Canada", "England", "Uruguay", "South Korea"],
    C: ["Argentina", "Switzerland", "Nigeria", "Australia"],
    D: ["USA", "France", "Colombia", "Morocco"],
    E: ["Brazil", "Croatia", "Algeria", "Iran"],
    F: ["Spain", "Denmark", "Ecuador", "Saudi Arabia"],
    G: ["Belgium", "Serbia", "Cameroon", "Qatar"],
    H: ["Portugal", "Poland", "Ivory Coast", "Wales"],
    I: ["Netherlands", "Sweden", "Ghana", "Peru"],
    J: ["Italy", "Austria", "Mali", "Chile"],
    K: ["Colombia", "Hungary", "Egypt", "Venezuela"],
    L: ["Switzerland", "Scotland", "Tunisia", "New Zealand"]
};

/** ISO 3166-1 alpha-2 (and flagcdn regional codes where useful) */
const TEAM_FLAG_CODES = {
    Mexico: "mx",
    Germany: "de",
    Senegal: "sn",
    Japan: "jp",
    Canada: "ca",
    England: "gb-eng",
    Uruguay: "uy",
    "South Korea": "kr",
    Argentina: "ar",
    Switzerland: "ch",
    Nigeria: "ng",
    Australia: "au",
    USA: "us",
    France: "fr",
    Colombia: "co",
    Morocco: "ma",
    Brazil: "br",
    Croatia: "hr",
    Algeria: "dz",
    Iran: "ir",
    Spain: "es",
    Denmark: "dk",
    Ecuador: "ec",
    "Saudi Arabia": "sa",
    Belgium: "be",
    Serbia: "rs",
    Cameroon: "cm",
    Qatar: "qa",
    Portugal: "pt",
    Poland: "pl",
    "Ivory Coast": "ci",
    Wales: "gb-wls",
    Netherlands: "nl",
    Sweden: "se",
    Ghana: "gh",
    Peru: "pe",
    Italy: "it",
    Austria: "at",
    Mali: "ml",
    Chile: "cl",
    Hungary: "hu",
    Egypt: "eg",
    Venezuela: "ve",
    Scotland: "gb-sct",
    Tunisia: "tn",
    "New Zealand": "nz"
};

const KNOCKOUT_START_INDEX = 3;

function teamFlagImg(team) {
    const code = TEAM_FLAG_CODES[team];
    const initials = team.split(/\s+/).map(w => w[0]).join("").slice(0, 3).toUpperCase();
    if (!code) {
        return `<div class="flag-round flag-fallback" title="${team.replace(/"/g, "&quot;")}">${initials}</div>`;
    }
    const src = `https://flagcdn.com/h48/${code}.png`;
    const esc = initials.replace(/"/g, "&quot;");
    return `<img class="flag-round" src="${src}" alt="" width="48" height="48" loading="lazy" title="${team.replace(/"/g, "&quot;")}" data-fallback="${esc}" onerror="var d=document.createElement('div');d.className='flag-round flag-fallback';d.textContent=this.dataset.fallback;this.replaceWith(d)">`;
}

class WorldCupTournament {
    constructor() {
        this.selectedTeam = null;
        this.currentStageIndex = 0;
        this.groupWins = 0;

        this.stages = [
            { id: "group1", title: "Group Match 1" },
            { id: "group2", title: "Group Match 2" },
            { id: "group3", title: "Group Match 3" },
            { id: "R32", title: "Round of 32" },
            { id: "R16", title: "Round of 16" },
            { id: "QF", title: "Quarter Final" },
            { id: "SF", title: "Semi Final" },
            { id: "Final", title: "World Cup Final" }
        ];

        this.opponents = [];
    }

    start(team) {
        this.selectedTeam = team;
        this.currentStageIndex = 0;
        this.groupWins = 0;

        let allTeams = [];
        Object.values(groups).forEach(g => allTeams.push(...g));
        allTeams = allTeams.filter(t => t !== team);
        allTeams.sort(() => 0.5 - Math.random());

        this.opponents = allTeams.slice(0, 8);

        this.showBracket();
    }

    isKnockoutPhase() {
        return this.currentStageIndex >= KNOCKOUT_START_INDEX;
    }

    renderUpcomingKnockoutMatch(container) {
        const stage = this.stages[this.currentStageIndex];
        const opponent = this.opponents[this.currentStageIndex];

        container.innerHTML = `
            <p class="wc-knockout-intro">Upcoming match</p>
            <div class="wc-upcoming-match">
                <div class="wc-upcoming-team">
                    ${teamFlagImg(this.selectedTeam)}
                    <span class="wc-upcoming-name">${this.selectedTeam}</span>
                    <span class="wc-upcoming-label">You</span>
                </div>
                <div class="wc-vs">vs</div>
                <div class="wc-upcoming-team">
                    ${teamFlagImg(opponent)}
                    <span class="wc-upcoming-name">${opponent}</span>
                    <span class="wc-upcoming-label">${stage.title}</span>
                </div>
            </div>
        `;
    }

    showBracket() {
        const knockoutEl = document.getElementById("wc-knockout-bracket");
        const titleEl = document.getElementById("wc-stage-title");
        const infoEl = document.getElementById("wc-bracket-info");

        const stage = this.stages[this.currentStageIndex];
        const opponent = this.opponents[this.currentStageIndex];

        titleEl.innerText = stage.title;

        if (this.isKnockoutPhase()) {
            knockoutEl.classList.remove("hidden");
            knockoutEl.removeAttribute("aria-hidden");
            this.renderUpcomingKnockoutMatch(knockoutEl);
            infoEl.innerHTML = `<span style="font-size:0.95rem">Difficulty: ${difficultyLabel()} · Win to advance to the next round.</span>`;
        } else {
            knockoutEl.classList.add("hidden");
            knockoutEl.setAttribute("aria-hidden", "true");
            knockoutEl.innerHTML = "";
            let infoText = `<div class="wc-group-match-row">${teamFlagImg(this.selectedTeam)}<span class="wc-group-vs">vs</span>${teamFlagImg(opponent)}</div><br>
                <strong style="color:#fff;font-size:1.1rem">${this.selectedTeam}</strong> vs <strong style="color:#fff;font-size:1.1rem">${opponent}</strong>`;
            infoText += `<br><br>Group record: ${this.groupWins} wins — ${this.currentStageIndex - this.groupWins} losses<br><span style="font-size:0.95rem">Difficulty: ${difficultyLabel()} · Need 2 wins from 3 to reach the knockouts</span>`;
            infoEl.innerHTML = infoText;
        }

        switchScreen("worldcup-bracket-menu");
    }

    playMatch() {
        const opponent = this.opponents[this.currentStageIndex];
        startGame("worldcup", opponent);
    }

    advance(didWin) {
        const stage = this.stages[this.currentStageIndex];

        if (stage.id.startsWith("group")) {
            if (didWin) this.groupWins++;

            if (stage.id === "group3") {
                if (this.groupWins >= 2) {
                    this.currentStageIndex++;
                    this.showBracket();
                } else {
                    alert("Eliminated in the Group Stage. Better luck next time!");
                    showMainMenu();
                }
            } else {
                this.currentStageIndex++;
                this.showBracket();
            }
        } else {
            if (didWin) {
                if (stage.id === "Final") {
                    alert(`WORLD CHAMPIONS! Congratulations ${this.selectedTeam}!`);
                    showMainMenu();
                } else {
                    this.currentStageIndex++;
                    this.showBracket();
                }
            } else {
                if (stage.id === "SF") {
                    alert("Heartbreak in the Semi Finals! You have been eliminated.");
                    showMainMenu();
                } else {
                    alert("You have been knocked out of the tournament.");
                    showMainMenu();
                }
            }
        }
    }
}

const tournament = new WorldCupTournament();

function renderGroups() {
    const container = document.getElementById("group-container");
    container.innerHTML = "";

    for (const [groupName, teams] of Object.entries(groups)) {
        const groupCard = document.createElement("div");
        groupCard.className = "group-card";

        const title = document.createElement("h3");
        title.innerText = `Group ${groupName}`;
        groupCard.appendChild(title);

        teams.forEach(team => {
            const btn = document.createElement("button");
            btn.className = "team-btn";
            btn.innerText = team;
            btn.onclick = () => selectWorldCupTeam(team);
            groupCard.appendChild(btn);
        });

        container.appendChild(groupCard);
    }
}

function selectWorldCupTeam(team) {
    showWorldCupDifficulty(team);
}

function playNextWCMatch() {
    tournament.playMatch();
}

document.addEventListener("DOMContentLoaded", () => {
    renderGroups();
});
