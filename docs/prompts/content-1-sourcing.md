# Kickoff prompt — C1 (Source the content)

Copy everything below the rule into a fresh session on this repo.

---

Work **Phase C1 (Source the content)** of the Nostalgia Box delivery plan.

**Read first:** `docs/PLAN.md` (Phase C1), `docs/PRD.md` (§6).

**Branch:** develop on `claude/nostalgia-box-content-<suffix>`, commit, push. No PR.
Media files are **not** committed — only the shortlist and provenance records.

## What this phase actually produces

A **researched shortlist with evidence**, for a human to review and approve. It does
not produce a legal clearance, and you must not present it as one — see Non-negotiables.

## Decisions assumed

- **D3.** ≤1.2 GB per channel, ~6 GB across all five. At 720p H.264 CRF 21 (~2.5 Mbps)
  that is roughly **60–70 minutes of content per channel**.

## The five channels

| # | Channel | Theme |
|---|---|---|
| 01 | Cartoons | Vintage public-domain animation |
| 02 | Nature | Calm wildlife / landscapes |
| 03 | Rabbit (Kids) | Gentle kids' storytime content |
| 04 | Retro Ads | Nostalgic commercials & bumpers |
| 05 | Classics | Old public-domain shorts / serials |

## Build

- `content/shortlist.csv` — one row per candidate item, with columns:
  `channel, title, source_url, archive_identifier, stated_rights, publication_year,
  duration, resolution, notes`
- Target ~60–70 min per channel. **Prefer several shorter items over one long one** —
  more items means more tune-in variety and smaller re-download units when content updates
- `content/PROVENANCE.md` — for each shortlisted item, where the rights claim comes
  from: the archive's own rights statement, publication date, renewal status if known,
  and a direct link to the page making the claim
- Flag anything ambiguous in a separate `REVIEW-NEEDED` section rather than quietly
  including or excluding it

## Non-negotiables

1. **You are not clearing rights, you are gathering evidence for a human who will.**
   Record what each source *states* about rights and link to it. Never write "this is
   public domain" as your own conclusion — write "Internet Archive lists this as
   public domain, [link]".
2. **"On the Internet Archive" does not mean "public domain."** The Archive hosts
   material under many licences, including items uploaded without clear rights. Check
   the per-item rights statement, not the platform.
3. **Channel 03 (Rabbit / Kids) gets watched unsupervised by children.** Review every
   candidate item end to end, not just its title and thumbnail. Vintage animation in
   particular contains material that was ordinary in its era and is not acceptable now
   — racial caricature especially. Flag anything questionable; when in doubt, cut it.
4. **Stay inside the size ceiling (D3).** A channel that doesn't fit the device is not
   a channel. Record estimated post-transcode size per item.
5. Do not download tens of gigabytes speculatively. Shortlist first, fetch after review.

## Exit criteria

- Five channels shortlisted, each within the D3 ceiling, each ~60–70 minutes
- Every item has a provenance record with a working link
- Channel 03 items individually reviewed and that review stated explicitly
- The `REVIEW-NEEDED` section is empty *or* every entry in it has a specific question

## Report back

1. The shortlist summary — items and total runtime per channel.
2. Anything you could not find enough of. If a theme is thin in the public domain, say
   so now; it is much cheaper to change a channel's theme at C1 than at C3.
3. Items you excluded on content grounds, and why. This is a judgement the human should
   see rather than have silently made for them.
