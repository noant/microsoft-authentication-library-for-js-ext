require("@babel/register")({ extensions: [".js", ".jsx", ".ts", ".tsx"] });
require("msal-common-ext");
require("jsdom-global")("", {
    url: "https://localhost:8081/index.html"
});
window.crypto = require("@trust/webcrypto");
