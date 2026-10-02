# 4.2 The Stage Manager

## 🎭 The Scenario
Your site has a staging and a production environment: the same distribution, with a different bucket behind it and different baked values in the functions. You want to test both locally, from one project, without keeping two copies of `cloudfrontize.json` in sync.

## 📖 The Lesson: One Project, Settings per Run

In AWS, staging and production are usually two distributions created from the same template (CloudFormation, CDK or Terraform), with parameters for what differs: the bucket, the domain, the values baked into the functions.

CloudFrontize does the same with `--set path=value`: it changes one `cloudfrontize.json` setting **for this run only**. The file isn't edited, so the project in git stays the production one:

```bash
cloudfrontize --set origins.site.path=origins/staging --set bake.file=config/staging.env
```

- The path follows the file: `origins.site.path` is the `path` of the origin whose id is `site`; `bake.file` is the bake file.
- Values are JSON when they parse as JSON (`--set distribution.strict=true` is a boolean), text otherwise.
- The result is checked like the file: a setting that breaks an AWS rule, or names an origin that doesn't exist, stops the run with the reason.
- `validate`, `check` and `build` take `--set` too, so CI can check and build each environment from the same project.

With an S3 origin, the same idea switches buckets: `--set origins.site.bucket=my-site-staging`.

## 🗂️ This Project

| Path | What it is |
|---|---|
| `cloudfrontize.json` | The production setup: origin `site` serves `origins/production`, values from `config/production.env` |
| `origins/production/`, `origins/staging/` | Each environment's content (in AWS: one bucket each) |
| `functions/cloudfront/viewer-response.environment.js` | Adds `X-Environment` with the baked `__ENVIRONMENT__` value |
| `config/production.env`, `config/staging.env` | Each environment's baked values |
| `checks.json` | What production must do: `cloudfrontize check` runs it |
| `checks.staging.json` | What staging must do, with the settings it runs with (used by the tutorial runner) |

## 🎯 Your Goal
Serve the project as production, then as staging, without editing `cloudfrontize.json`.

## 🛠️ Run It
From this folder:
```bash
cloudfrontize validate     # production, as written
cloudfrontize --webui      # serves it on http://localhost:3000, with the workbench on http://localhost:3001
cloudfrontize check        # runs checks.json
```

## 🧪 How to Test
```bash
curl -si http://localhost:3000/ | grep -iE "x-environment|<h1>"      # production

# Stop it (Ctrl+C), then run it as staging
cloudfrontize --webui --set origins.site.path=origins/staging --set bake.file=config/staging.env
curl -si http://localhost:3000/ | grep -iE "x-environment|<h1>"      # staging
```

In the workbench, the **Distribution** inspector lists the settings in force for the run. Saving changes from the workbench writes the file without them, so they never end up in git by accident.

To build each environment's deployable code:
```bash
cloudfrontize build --set bake.file=config/staging.env --out dist-staging
cloudfrontize build --out dist-production
```
`build.json` records the settings each build used.

## 💡 Fidelity Tips
- **Keep production in the file.** What's in git should be what you deploy by default; `--set` describes how another environment differs.
- **Secrets don't go in `--set` either.** For S3, use `--set 'origins.site.credentials={"profile":"staging"}'` with an AWS profile, never keys on the command line (they'd end up in your shell history).
- **`--set` changes the run, not AWS.** A setting that AWS wouldn't accept (a CloudFront Function on an origin event, say) fails validation here too.

## 🎓 Learning More
- **AWS**: [Values that you specify when you create or update a distribution](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html)
- **CloudFrontize**: [Commands](../../../../README.md#-commands)
