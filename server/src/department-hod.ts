// Shared includes keep linked HOD details live wherever email routing is used.
export const hodEmployeeSelect = { id:true,employeeId:true,name:true,email:true,status:true } as const;
export const departmentWithHod = { include:{hodEmployee:{select:hodEmployeeSelect}} } as const;
