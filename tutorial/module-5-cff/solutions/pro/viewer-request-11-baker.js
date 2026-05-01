function handler(event) {
    var request = event.request;
    
    // 🍞 BAKE PLACEHOLDER
    var MODE = "__SECURITY_MODE__";

    if (MODE === "strict") {
        console.log("[CFF: Baker] Strict Mode Active");
        request.headers['content-security-policy'] = { value: "default-src 'self'" };
    } else {
        console.log("[CFF: Baker] Standard Mode Active: " + MODE);
    }

    return request;
}
