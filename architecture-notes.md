# Architecture Notes / Known Issues

## Data Source Issues
06/15/2026
- Some counties (e.g. St. Johns, FL) split documents across two separate domains:
  - Clerk site = late-stage BCC final decisions
  - County main site = early-stage subcommittee/department research
  - Current scraper architecture only targets one domain per county
  - Early-stage documents may be missed for these counties
  - Not a priority now — most counties use Legistar or CivicPlus anyway
  - Revisit when building the generic fallback scraper adapter


06?17/2026
-We need to build a maintenance system for the static list of counties and the software they use, as well as verifying that links still work
 