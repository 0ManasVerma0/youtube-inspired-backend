import dotenv from "dotenv";
import {app} from "./app.js";
import connectDb from "./db/index.js";

dotenv.config({
    path: "./.env"
})

const PORT =process.env.PORT || 3001

connectDb()
.then( () => {
    app.listen(PORT, () => {
    console.log(`Server is running at port ${PORT}..`)
})
})
.catch((err) => {
    console.log("MongoDb connection Error", err)
})