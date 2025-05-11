import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"

// const registerUser = asyncHandler(async (req, res) => {
//   const { fullname, email, username, password } = req.body;

//   //validation
//   if (
//     [fullname, email, username, password].some((field) => field?.trim() === "")
//   )
//     throw new ApiError(400, "all fields are required");

//   const existedUser = await User.findOne({
//     $or: [{ username }, { email }],
//   });

//   if (existedUser) {
//     throw new ApiError(409, "User with email or username already exists");
//   }

//   console.warn(req.files);
//   const avatarLocalPath = req.files?.avatar?.[0]?.path
//   const coverImagePath = req.files?.coverImage?.[0]?.path

//   if(!avatarLocalPath){
//     throw new ApiError(408, "Avatar file is missing")
//   }

//   // const avatar = await uploadOnCloudinary(avatarLocalPath)
//   // let coverImage = ""
//   // if(coverImagePath){
//   //   coverImage = await uploadOnCloudinary(coverImagePath)
//   //   }

//   let avatar;
//   try {
//     avatar = await uploadOnCloudinary(avatarLocalPath)
//     console.log("Uploaded avatar", avatar)
//   } catch (error) {
//     console.log("Error uploading avatar", error)
//     throw new ApiError(500, "Failed to upload avatar")
//   }

//   let coverImage;
//   try {
//     coverImage = await uploadOnCloudinary(coverImagePath)
//     console.log("Uploaded cover image", coverImage)
//   } catch (error) {
//     console.log("Error uploading avatar", error)
//     throw new ApiError(500, "Failed to upload cover image")
//   }

//     const user = await User.create({
//         fullname,
//         avatar: avatar.url,
//         coverImage: coverImage?.url || "",
//         email,
//         password,
//         username: username.toLowerCase()
//     })

//     const createdUser = await User.findById(user._id).select(
//         "-password -refreshToken"
//     )

//     if (!createdUser){
//         throw new ApiError(500, "Something went wrong while registering a user")
//     }

//     return res
//         .status(200)
//         .json(new ApiResponse(200, createdUser, "User registered succesfully"))

// });

const generateAccessAndRefreshToken = async(userId) => {
 try {
  const user = await User.findById(userId)
  if(!user){
   throw new ApiError(404, "User not found")
  }
  const accessToken = user.generateAccessToken()
  const refreshToken = user.generateRefreshToken()
 
  user.refreshToken = refreshToken
  await user.save({validateBeforeSave: false})
  return {accessToken, refreshToken}
 } catch (error) {
    throw new ApiError(500, "something went wrong while generating access and refresh tokens")
 }
}

const registerUser = asyncHandler(async (req, res) => {
  console.log("Register request received");
  console.log("Request body:", req.body);
  console.log("Request files:", req.files);
  
  const { fullname, email, username, password } = req.body;

  // Better validation - check if fields exist first
  if (!fullname || !email || !username || !password) {
    throw new ApiError(400, "All fields are required");
  }
  
  if ([fullname, email, username, password].some((field) => field.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  let avatar;
  try {
    console.log("Uploading avatar from path:", avatarLocalPath);
    avatar = await uploadOnCloudinary(avatarLocalPath);
    console.log("Avatar upload result:", avatar);
    
    if (!avatar || !avatar.url) {
      throw new ApiError(500, "Failed to upload avatar - no URL returned");
    }
  } catch (error) {
    console.error("Error uploading avatar:", error);
    throw new ApiError(500, "Failed to upload avatar");
  }

  // Only upload cover image if it exists
  let coverImage = null;
  const coverImagePath = req.files?.coverImage?.[0]?.path;
  if (coverImagePath) {
    try {
      console.log("Uploading cover image from path:", coverImagePath);
      coverImage = await uploadOnCloudinary(coverImagePath);
      console.log("Cover image upload result:", coverImage);
    } catch (error) {
      console.error("Error uploading cover image:", error);
      // Non-critical, we can continue without cover image
    }
  }

  try {
    console.log("Creating user in database");
    const user = await User.create({
      fullname,
      avatar: avatar.url,
      coverImage: coverImage?.url || "",
      email,
      password,
      username: username.toLowerCase()
    });

    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken"
    );

    if (!createdUser) {
      throw new ApiError(500, "Something went wrong while registering user");
    }

    console.log("User created successfully");
    return res
      .status(201)  // Changed from 200 to 201 for resource creation
      .json(new ApiResponse(201, createdUser, "User registered successfully"));
  } catch (error) {
    console.error("Database error:", error);
    throw new ApiError(500, "Failed to create user in database");
  }
});

const loginUser = asyncHandler(async (req, res) => {
  //get data from body
  const {email, username, password} = req.body

  //validation 
  if(!email){
    throw new ApiError(400, "Email is required")
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if(!user){
    throw new ApiError(404, "User not found")
  }

  //validate password
  const isPasswordValid = await user.isPasswordCorrect(password)
  if(!isPasswordValid){
    throw new ApiError(401, "Invalid credentials")
  }

  const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

  if(!loggedInUser){
    throw new ApiError(404, "There's no logged in user")
  }

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
  }

  return res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", refreshToken, options).json(new ApiResponse(200, {user: loggedInUser, accessToken, refreshToken}, "User logged in successfully"))
})

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      }
    },
    {new: true}
  )

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "development"
  }

  return res  
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"))
})

const refreshAccessToken = asyncHandler( async (req, res) => {

  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

  if(!incomingRefreshToken){
    throw new ApiError(401, "Refresh token is required")
  }

  try {
    jwt.verify(
      incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET
    )
    const user = await User.findById(decodedToken?._id)

    if(!user){
      throw new ApiError(401, "Invalid refresh token")
    }

    if (incomingRefreshToken !== user?.refreshToken){
      throw new ApiError(401, "Invalid refresh token")
    }

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "development"
    }

    const {accessToken, refreshToken: newRefreshToken} = await generateAccessAndRefreshToken(user._id)

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200, 
          {accessToken,
            refreshToken: newRefreshToken
          },
          "Access token refreshed successfully"
        )
      )

  } catch (error) {
    throw new ApiError(500, "Something went wrong while refreshing access token")
  }
})

export { registerUser };
export { loginUser };
export { refreshAccessToken };
export { logoutUser };