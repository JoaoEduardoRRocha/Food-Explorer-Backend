import { MongoHelper } from "./config/mongo-helper";
import { AddUser } from "./models/user";
import { AddFood, Food } from "./models/food";
import { ObjectId } from 'mongodb'

var cors = require("cors");
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
const port = 3000;
const otpGenerator = require("otp-generator");
const nodemailer = require("nodemailer");

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.header("Acess-Control-Allow-Origin", "*");
  next();
});

app.get("/api/foods/get-by-id", async (req, res) => {
  const { _id } = req.query;
  if (_id.length < 12) {
    return res.status(400).json("Id inválido!");
  }

  if (!_id) {
    return res.status(400).json("Id não foi forcenido!");
  }

  const food = await MongoHelper.getCollection("foods").findOne({_id: new ObjectId(_id)});
  res.send(food);
});

app.get("/api/foods/", async (req, res) => {
  try {
    const foods = await MongoHelper.getCollection('foods').find().toArray()
    res.send(foods);
  }
  catch (error) {
    console.error("Erro ao pegar os pratos!", error);
    res.status(500).json("Erro interno do servidor");
  }
});

app.post("/api/foods", async (req, res) => {
  try {
    const requireFields = [
      "name",
      "description",
      "price",
      "type",
      "ingredients",
    ];
    for (const field of requireFields) {
      if (!req.body[field]) {
        return res.status(400).json(`Está faltando o campo ${field}.`);
      }
    }

    const { name, description, price, type, ingredients } = req.body;

    const food: AddFood = {
      name,
      description,
      price,
      type,
      image: "",
      ingredients,
    };

    const createdFood = await MongoHelper.getCollection("foods").insertOne(
      food
    );
    res.send(createdFood);
  } catch (error) {
    console.error("Erro ao adicionar prato:", error);
    res.status(500).json("Erro interno do servidor");
  }
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json("Verifique de preencher todos os campos!");
    }

    const userExist = await MongoHelper.getCollection("users").findOne({
      email,
    });

    if (userExist) {
      return res.status(400).json("Este email já está em uso, tente outro!");
    }

    const salt = 10;
    const hashedPassword = await bcrypt.hash(password, salt);

    const user: AddUser = {
      name,
      email,
      role: "user",
      password: hashedPassword,
      forgotPasswordToken: "",
      forgotPasswordExpires: "",
      createdAt: new Date().toISOString(),
    };

    const newUser = await MongoHelper.getCollection("users").insertOne(user);

    const secret = "secret";
    const token = jwt.sign(
      { email: newUser.email, role: newUser.role, _id: newUser._id },
      secret
    );

    res.status(200).json({ token });
  } catch (error) {
    console.error("Erro durante o cadastro:", error);
    res.status(500).json("Erro interno do servidor");
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json("Por favor, forneça um email e senha existente.");
    }

    const user = await MongoHelper.getCollection("users").findOne({ email });
    if (!user) {
      return res.status(401).json("Usuário inválido.");
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json("Senha inválida.");
    }

    const secret = "secret";
    const token = jwt.sign(
      { email: user.email, _id: user._id, role: user },
      secret
    );

    res.status(200).json({ token });
  } catch (error) {
    console.error("Erro durante o login:", error);
    res.status(500).json("Erro interno do servidor");
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await MongoHelper.getCollection("users").findOne({ email });

    if (!user) {
      return res.status(404).json("Usuário não encontrado com esse email.");
    }

    const token = otpGenerator.generate(6, {
      upperCase: false,
      specialChars: false,
    });

    user.forgotPasswordToken = token;
    user.forgotPasswordExpires = new Date(new Date().getTime() + 3600000);
    await MongoHelper.getCollection("users").updateOne(
      { email },
      {
        $set: {
          forgotPasswordToken: token,
          forgotPasswordExpires: user.forgotPasswordExpires,
        },
      }
    );

    var transport = nodemailer.createTransport({
      host: "sandbox.smtp.mailtrap.io",
      port: 2525,
      auth: {
        user: "2ffc8e295af86c",
        pass: "f0042201bc161b",
      },
    });

    await transport.sendMail({
      from: "seuemail@example.com",
      to: email,
      subject: "Recuperação de senha",
      text: `Olá ${user.name}, você solicitou a recuperação de senha. Seu token de recuperação é: ${token}, clique nesse link para resetar sua senha: http://localhost:5173/change-password?email=${email}&token=${token}`,
    });

    res
      .status(200)
      .json("Token de recuperação enviado com sucesso para o seu email.");
  } catch (error) {
    console.error("Erro durante a recuperação de senha:", error);
    res.status(500).json("Erro interno do servidor");
  }
});

app.post("/api/auth/otp-login", async (req, res) => {
  try {
    const { email, otpToken } = req.body;

    if (!email || !otpToken) {
      return res.status(400).json("Email e token OTP são obrigatórios.");
    }

    const user = await MongoHelper.getCollection("users").findOne({ email });
    if (!user) {
      return res.status(401).json("Usuário inválido.");
    }

    if (
      user.forgotPasswordToken !== otpToken ||
      user.forgotPasswordExpires < new Date()
    ) {
      return res.status(401).json("Token OTP inválido ou expirado.");
    }

    const secret = "secret";
    const jwtToken = jwt.sign(
      { email: user.email, role: user.role, _id: user._id },
      secret
    );

    await MongoHelper.getCollection("users").updateOne(
      { email },
      {
        $set: {
          forgotPasswordToken: null,
          forgotPasswordExpires: null,
        },
      }
    );

    res.status(200).json({ jwtToken });
  } catch (error) {
    console.error("Erro durante o login com OTP:", error);
    res.status(500).json("Erro interno do servidor");
  }
});

app.post("/api/auth/update-password", async (req, res) => {
  try {
    const { token } = req.headers;

    if (!token) {
      return res.status(401).json("Token JWT não fornecido.");
    }

    const { password } = req.body;

    console.log(password);
    if (!password) {
      return res.status(400).json("Nova senha não fornecida.");
    }

    const salt = 10;
    const hashedPassword = await bcrypt.hash(password, salt);

    const payload = jwt.verify(token, "secret");

    await MongoHelper.getCollection("users").updateOne(
      { email: payload.email },
      { $set: { password: hashedPassword } }
    );

    res.status(200).json("ok");
  } catch (error) {
    console.error("Falha ao trocar a senha!", error);
    res.status(500).json("Erro interno do servidor");
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const { token } = req.headers;

    if (!token) {
      return res.status(401).json("Token JWT não fornecido.");
    }

    const payload = jwt.verify(token, "secret");

    const user = await MongoHelper.getCollection("users").findOne({
      email: payload.email,
    });
    delete user.password;
    delete user.forgotPasswordToken;
    delete user.forgotPasswordExpires;
    res.send(user);
  } catch (error) {
    console.error("Falha", error);
    res.status(500).json("Erro interno do servidor");
  }
});

MongoHelper.connect("mongodb://127.0.0.1:27017/food-explorer")
  .then(() => {
    app.listen(port, () => {
      console.log("Está funcionando!");
    });
  })
  .catch(console.error);
