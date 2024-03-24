export interface User {
  _id: string
  name: string
  email: string
  password: string
  role: string
  forgotPasswordToken: string
  forgotPasswordExpires: string
  createdAt: string
}

export interface AddUser {
  name: string
  email: string
  password: string
  role: string
  forgotPasswordToken: string
  forgotPasswordExpires: string
  createdAt: string
}
