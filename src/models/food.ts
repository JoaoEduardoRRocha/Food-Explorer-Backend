export interface Food {
  _id: number
  name: string
  description: string
  price: number
  image: string
  type: string
  ingredients: string[]
}

export interface AddFood {
  name: string
  description: string
  price: number
  image: string
  type: string
  ingredients: string[]
}
