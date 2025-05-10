import express from "express";
import cors from "cors";

const app = express();

app.use(
    cors({
        origin: process.env.CORS_ORIGIN,
        credentials: true
    })
)

//Common middlewares
app.use(express.json({limit:"16kb"}))
app.use(express.urlencoded({extended: true, limit: "16kb"}))
app.use(express.static("public"))

//Import Routes
import healthcheckRouter from "./routes/healthcheck.routes.js" 

//Routes
app.use("/api/v1/healthcheck", healthcheckRouter)

export {app}