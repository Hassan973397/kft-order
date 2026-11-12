// Shop catalogue — the only file to edit when stock or prices change.
// price / pair are in thousands of IQD. Put a finished colour in soldOut to grey it out.
window.KFT = {
  whatsapp: "9647801273388",
  phoneDisplay: "0780 127 3388",
  delivery: 5,            // per order, any province
  wholesaleFrom: 10,      // pieces; at or above this the order is flagged as wholesale
  maxPerLine: 500,
  products: [
    {id:"huko", name:"بولو Huko شتوي", desc:"جاكار قطن 100%", price:22,
     sizes:["L","XL","2XL","3XL","4XL","5XL","6XL","7XL"], colours:[], soldOut:[], note:"من وزن 70 لحد 150 كيلو"},
    {id:"ff", name:"بولو FF الموسم", desc:"6 ألوان", price:20,
     sizes:["L","XL","2XL","3XL"], colours:["بيج","رصاصي","أسود","نيلي","سمائي","أوف وايت"], soldOut:[]},
    {id:"jeeb", name:"بولو بجيب", desc:"قطن 100% · القطعتين بـ 35 ألف", price:18, pair:35,
     sizes:["L","XL","2XL","3XL","4XL","5XL","6XL","7XL"], colours:["أسود","رصاصي فاتح","رصاصي غامق","بيجي","سمائي","زيتوني","فيروزي"], soldOut:[], note:"من وزن 75 لحد 150 كيلو"},
    {id:"jeans", name:"قميص جينز تنسل", desc:"ياخة عظم ودگم خشب", price:20,
     sizes:["L","XL","2XL","3XL"], colours:["كحلي","بحري","رصاصي","نيلي طوخ"], soldOut:[]},
    {id:"jeans1", name:"قميص تنسل بجيب واحد", desc:"شكل الجينز", price:20,
     sizes:["L","XL","2XL","3XL"], colours:["نيلي","رصاصي","كحلي","بحري"], soldOut:[]},
    {id:"striped", name:"قميص تنسل مقلّم", desc:"فول ليكرا", price:20,
     sizes:["L","XL","2XL","3XL"], colours:["بحري","نيلي","رصاصي","أسود كحلي"], soldOut:[]},
    {id:"tencel", name:"قميص تنسل ألوان", desc:"بيه ليكرا", price:20,
     sizes:["L","XL","2XL","3XL"], colours:["سمائي","أسود","قهوائي","جوزي","نيلي"], soldOut:[]},
    {id:"jacquard", name:"قميص تروكة جاكار شتوي", desc:"يلبس قميص وتروكة", price:25,
     sizes:["L","XL","2XL","3XL"], colours:["قهوائي","بحري","رصاصي","أزرق","نيلي","أسود كحلي"], soldOut:[], note:"من وزن 70 لغاية 105 كيلو"},
  ],
  governorates: ["النجف","بغداد","كربلاء","بابل","البصرة","ذي قار","الديوانية","واسط","ميسان","المثنى","ديالى","صلاح الدين","كركوك","الأنبار","نينوى","أربيل","السليمانية","دهوك","حلبجة"],
};
