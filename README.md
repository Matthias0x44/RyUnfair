# RyUnfair ✈️💰

**Track your Ryanair flight delays and claim the compensation you're legally entitled to under EU261/UK261 law.**

> They delayed you. Make them pay.

## Features

### 🛫 Real-Time Flight Tracking
- Enter your flight number, date, and route
- Track live flight status with simulated delay data
- See estimated arrival and doors-open time (compensation is measured from when doors open, not landing!)

### 💷 Automatic Compensation Calculator
- Calculates your entitled compensation based on:
  - Flight distance
  - Delay duration (3+ hours required)
  - UK vs EU regulations
- Shows potential payout: €250-€600 / £220-£520

### 📧 Email Reminders
- Get notified when your delay qualifies for compensation
- Never miss a claim deadline

### 📅 Calendar Export
- Add claim reminders to your calendar (.ics download)

### 🔍 Historic Flight Lookup
- Check past flights for compensation eligibility
- You have **6 years** in the UK and **3 years** in most EU countries to claim!

### 📋 Ryanair Claim Cheat Sheet
- Common rejection tactics and how to counter them
- "Magic words" that work in claims
- What counts as "extraordinary circumstances"
- System workarounds for their buggy claim portal
- Letter Before Action template (copy-paste ready)

### ⚖️ Know the Law
- Full explanation of EU Regulation 261/2004 and UK261
- Compensation amounts by distance
- Time limits by country
- Key court cases that support your claim

## Getting Started

1. **Open the app**: Simply open `index.html` in your browser, or run a local server:
   ```bash
   python3 -m http.server 8080
   ```
   Then visit `http://localhost:8080`

2. **Enter your flight details**:
   - Flight number (e.g., FR1234)
   - Flight date
   - Departure airport code (e.g., STN)
   - Arrival airport code (e.g., DUB)

3. **Track and monitor** your flight for delays

4. **If delayed 3+ hours**: Follow the step-by-step guide to claim your compensation

## Compensation Amounts

| Distance | Delay Required | EU Amount | UK Amount |
|----------|---------------|-----------|-----------|
| Under 1,500km | 3+ hours | €250 | £220 |
| 1,500-3,500km | 3+ hours | €400 | £350 |
| Over 3,500km | 3+ hours | €600 | £520 |

## Important Notes

- **Delay is measured from doors opening**, not when the plane lands. Add 10-15 minutes to the airline's stated delay.
- **Don't accept vouchers** - you're entitled to cash compensation
- **"Extraordinary circumstances"** is often misused by airlines. Technical faults, crew shortages, and "operational reasons" do NOT qualify!

## Tech Stack

- Pure HTML5, CSS3, JavaScript (ES6+)
- No frameworks or dependencies
- OpenSky Network API integration (for real flights)
- LocalStorage for saving flights and reminders
- Responsive design

## Files

```
RyUnfair/
├── index.html      # Main HTML structure
├── styles.css      # Styling (dark theme, responsive)
├── app.js          # Core application logic
└── README.md       # This file
```

## Disclaimer

RyUnfair is not affiliated with Ryanair. This tool helps passengers understand and exercise their legal rights under EU261/UK261 regulations. Always verify delay times with official sources before claiming.

## License

MIT License - Feel free to use, modify, and share.

---

Made with ✈️ and frustration by delayed passengers everywhere.

