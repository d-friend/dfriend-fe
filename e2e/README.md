# Live pilot E2E

The browser pilot suite uses the real frontend, NestJS backend, AI service,
teacher/student accounts, and a local source document. It intentionally does
not commit credentials.

```bash
cp .env.e2e.example .env.e2e.local
set -a; source .env.e2e.local; set +a
npm run test:e2e:pilot
```

`test:e2e:pilot` creates a uniquely named class, enrolls the configured
student, uploads the configured document, then drives both wizard and Copilot
draft/review/publish paths. It finally confirms that the student can open the
published lesson's Session 1.

`E2E_GENERATION_TIMEOUT_MS` is a test ceiling, not a performance target. A
successful run above the pilot latency threshold still needs to be reported.

The application requires a deadline at least one day after publish, so a
teacher report cannot be honestly asserted in the same immediate run. Once
students have produced evidence, run the AI-service pilot runner and review
the generated report and feedback against the rubric manually.

```bash
cd ../ai-service
python3 -m scripts.pilot_e2e --existing-lesson-id <published_lesson_id> --repeats 3 --reviewer Eric
```
