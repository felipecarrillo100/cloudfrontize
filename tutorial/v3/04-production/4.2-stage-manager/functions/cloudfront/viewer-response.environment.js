// The Stage Manager: says which environment answered (baked per environment)
const ENVIRONMENT = "__ENVIRONMENT__";

async function handler(event) {
    const response = event.response;
    response.headers['x-environment'] = { value: ENVIRONMENT };
    return response;
}
