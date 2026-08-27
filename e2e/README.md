# Live pilot E2E

The browser pilot suite uses the real frontend, NestJS backend, AI service,
teacher/student accounts, and a local source document. It intentionally does
not commit credentials.

```bash
cp .env.e2e.example .env.e2e.local
set -a; source .env.e2e.local; set +a
npm run test:e2e:pilot
```

`test:e2e:pilot` creates two uniquely named classes, enrolls the configured
student in both, uploads the configured document, then publishes one wizard
lesson to both classes. It asserts that both publications point to the same
canonical AI lesson but have distinct public publication IDs. It also drives a
Copilot draft/review/publish path and confirms that the student can open the
published Session 1.

`E2E_GENERATION_TIMEOUT_MS` is a test ceiling, not a performance target. A
successful run above the pilot latency threshold still needs to be reported.

Manual class reporting no longer requires waiting for the deadline: it is valid
from `1/N` and rejected at `0/N`. Automatic reporting still requires exact
`N/N`. The basic pilot suite stops at Session 1 and therefore does not claim
report/follow-up acceptance.

Full Unified V2 acceptance requires the ten live stories in the accepted spec.
Before running them, prepare:

- a migrated disposable database with the Unified V2 migration recorded;
- one teacher, at least two target students, and one non-target student;
- a source document and enough exact-skill bank material;
- a legacy main and legacy follow-up fixture that predate V2;
- permission to create classes, publish lessons, complete Session 2, and append
  immutable report versions.

Record the IDs and evidence for each story in the run artifact. A mocked API
suite, static check, or a browser run that stops before Session 2 is not the
cross-service acceptance suite.

```bash
cd ../ai-service
python3 -m scripts.pilot_e2e --existing-lesson-id <published_lesson_id> --repeats 3 --reviewer Eric
```
