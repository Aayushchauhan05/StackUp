const express = require("express");
const httpProxy = require("http-proxy");

const app = express();
const PORT = 8000;
const BasePath = ``;



const proxy = httpProxy.createProxyServer();

app.use((req, res) => {
  const host = req.hostname; 
  const subdomain = host.split('.')[0];
  const resolvesTo = `${BasePath}/${subdomain}`; 

  console.log(`Proxying request to: ${resolvesTo}`);

  proxy.web(req, res, {
    target: resolvesTo,
    changeOrigin: true
  }, (err) => {
    console.error("Proxy error:", err);
    res.status(500).send("Proxy error");
  });
});
proxy.on(`proxyReq`,(proxyReq,req,res)=>{
const url=req.url;
if(url==='/'){
proxyReq.path+='index.html'
}
})

app.listen(PORT, () => {
  console.log(`Reverse proxy running at port ${PORT}`);
});
