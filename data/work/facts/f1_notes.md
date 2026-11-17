# F1 notes (auction, rules and results) - verified_on 2026-11-17

## Headline limitation
Every external fact in the F1 files is `REPORTED (search summary only)` or `UNKNOWN`. None is VERIFIED.
Reason: WebFetch could not read any site in this session (network policy, DNS ENOTFOUND, or "unable to fetch").
Only WebSearch result summaries were available. Per the supervisor's evidence rule, a search summary is not verification.
No fact here was filled from memory. Where a summary itself said "from memory", that text was discarded (2024 playoff dates).
Publication dates are mostly not shown in search summaries; where a date sits in the URL slug it is recorded as such.

## Hosts that could not be read (WebFetch)
Network policy (getaddrinfo ENOTFOUND): www.iplt20.com, en.wikipedia.org, www.espncricinfo.com, www.rajasthanroyals.com, www.outlookindia.com, sportsdigest.in, www.businesstoday.in, www.crictracker.com, sports.yahoo.com, www.mykhel.com, www.wionews.com, www.thequint.com.
"Claude Code is unable to fetch": www.cricbuzz.com, timesofindia.indiatimes.com.
Not tried (same policy assumed): bcci.tv, thehindu.com, hindustantimes.com, ndtv.com, indianexpress.com. They need to be allowed under Network access before F2.

## What could not be verified, and why
- Auction type, date, venue, purse, squad/overseas limits, RTM, trade window, Impact Player 2027: only search summaries. No BCCI/IPL notice read.
- Purse figure: UNKNOWN. Reported Rs 157 cr salary cap (not the purse) and Rs 130 cr purse (one source); a blog says Rs 120 cr (mega-auction framing).
- RR retained/released/purse/slots: no list published or findable as of 2026-11-17 (deadline day). `rr_squad_2027.csv` holds no confirmed player rows.
- Auction pool: not published; `auction_pool_2027.csv` NOT written.
- Team identity: only partial player evidence (see `team_identity.csv`). Not found in summaries: Shivam Dube, Shikhar Dhawan, Rinku Singh, Abhishek Sharma, David Warner, Axar Patel, KL Rahul as team members. Several summaries conflict with our assumptions (Faf du Plessis at DC in the 2025-26 cycle; David Miller reported released by LSG; Pant at LSG 2025-26; Travis Head / Klaasen listed under CSK by one source, probably an error). Our inferred names are NOT contradicted by any reported match result (see data-consistency rows), but squad confirmation per id is incomplete. Ids 7 (DC) and 242 (SRH) are the weakest.
- Results (task 5): no season results page could be read. Coverage is partial and search-driven. Season 2022: no no-result / DLS / super-over found (not proof that none exist). DLS in 2022-24: none found, not verified absent.
- Match-level official result text (item e): not done for the other matches. Rows not listed in `results_verification.csv` are UNVERIFIED, not "normal".
- 8 May 2025 PBKS v DC: abandonment and replay reported; whether its player statistics count in official records is UNKNOWN (no source).
- Season leaders: winners found for all five seasons. Second-place totals found for 2023 (du Plessis), 2024 (Gaikwad), and loosely 2025 and 2026. 2022 second place not found.
- Super over 2026: occurred (16th in IPL history, Narine involved); opponent, date and winner unknown; cannot be matched to a match_id.

## Conflicts and oddities
1. Retention deadline: 15 Nov original vs 17 Nov extended. Several outlets report the extension; no official notice read.
2. Auction purse: 157 cr cap vs 130 cr purse vs 120 cr (blog). Do not use.
3. Auction format: "mini" (many sources) vs "mega" (one blog, low reliability).
4. RTM: none at mini-auction (summary) vs 2 RTM cards (same blog).
5. BCCI confirmation of the Goa date: one summary says no formal public announcement, another says BCCI confirmed.
6. Impact Player 2027: "BCCI confirms continuation through 2027" (Cricadium) vs "decision delayed / under review" (Sep 2026 PTI-based reports).
7. Overseas non-registration penalty: ineligible next year vs one-year ban.
8. 2023 final date: 28 May vs 29 May. Our key date is 2023-05-29 (consistent with the later date).
9. 2023 Orange Cap runner-up: 730 vs 830 (du Plessis).
10. 2024: three no-result matches (GT v KKR 13 May, GT v SRH, RR v KKR 19 May) are absent from our keys (71 matches). Consistent with no balls bowled. The 19 May RR v KKR game: summaries differ on whether the 7-over contest began.
11. 2025: RCB v KKR (17 May, no ball) absent from our keys. Our 2025 table has 74 rows: 40751 (8 May, 63 balls) and 43057 (24 May replay) are both present, so analyses that sum stats must treat 40751 as an abandoned match.
12. 2025 PBKS v DC: one summary calls the replay "match 58"; our key gives order 58 to the 8 May game.
13. 2023-05-03 LSG v CSK: one report says 2 points shared; most say 1 each.
14. 2025-05-06 MI v GT: the DLS target is "147 from 19 overs" in the summary. Our data: MI 121 balls, GT 123 balls.
15. A summary of the 2025 KKR v PBKS match mentions a "5-over chase target 61"; the match ended as a no-result, so that is a hypothetical, not a result.
16. Data anomalies in our keys not explained by any summary (unverified): 2022 14129 (RCB v SRH, 49-ball chase), 14153; 2024 31249; 2025 40705, 40724, 40764 (PBKS 87 balls, all out); 2026 50360 (DC v RCB 103/39). Likely collapses; not checked.

## Counts (results_verification.csv, all REPORTED not verified)
- NR / abandoned: 2022 0 found; 2023 1 (matched); 2024 3 (0 matched); 2025 3 NR + 1 abandoned-with-play (3 of 4 matched; RCB v KKR unmatched); 2026 1 (matched).
- DLS: 2025 1 (MI v GT). Reduced overs without DLS: 2025 1 (RCB v PBKS 14 ov), 2026 1 (RR v MI 11 ov). 2023 final rain-affected: result and target UNKNOWN.
- Super over: 2025 1 (DC beat RR; matched by team only, candidate 40725); 2026 1 (unmatched). 2022-24 none found.
- Playoffs: 2022 4/4 with winners; 2023 4/4 listed, Q2 result and final winner UNKNOWN; 2024 4/4 listed, Q1 and Q2 results UNKNOWN; 2025 4/4; 2026 4/4.
- Unmatched to our keys: 2024 x3, 2025 x1, 2026 super over x1 = 5 items. Matched by position or date: all others.

## Recheck list for F2
| Item | Recheck date |
|---|---|
| Official retention/release lists (all 10), RR purse and slots | 2026-11-18, again 2026-11-20 |
| Whether lists were published on 17 Nov as extended | 2026-11-18 |
| Hardik/Arshdeep and other pending trades; RR-LSG talks | 2026-11-18, then weekly to 2026-12-09 |
| Trade window close (reported 9 Dec) and reopen (17 Dec) | 2026-12-01 |
| Auction purse, squad limits, RTM, overseas XI, overseas fee cap | 2026-11-20 and before the final recommendations |
| Impact Player 2027 decision | 2026-12-01 |
| Auction pool (register reported 3 Dec); registration close 23 Nov | 2026-11-24, 2026-12-03 |
| Auction date/venue and clash with India v Sri Lanka ODI | 2026-12-01 and 2026-12-14 |
| Season results, playoffs, DLS, super overs, leaders: needs readable pages (ESPNcricinfo, iplt20.com, Wikipedia, Cricbuzz) | as soon as the hosts are allowed |
| PBKS v DC 8 May 2025 stats status | as soon as a source can be read |
