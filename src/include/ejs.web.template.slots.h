/*
   ejs.web.template.slots.h -- Native property slot definitions for the "ejs.web.template" module
  
   This file is generated by ejsmod
  
   Slot definitions. Version 1.1.0.
 */

#ifndef _h_SLOTS_EjsWebTemplateSlots
#define _h_SLOTS_EjsWebTemplateSlots 1


/*
   Slots for the "ejs.web.template" module 
 */


/*
    Class property slots for the "Template" type 
 */
#define ES_Template__origin                                            27
#define ES_Template_load                                               27

#define ES_Template_NUM_CLASS_PROP                                     28

/*
 * Instance slots for "Template" type 
 */
#define ES_Template_NUM_INSTANCE_PROP                                  0

/*
    Local slots for methods in type "Template" 
 */
#define ES_Template_load_request                                       0


/*
    Class property slots for the "TemplateParser" type 
 */
#define ES_TemplateParser__origin                                      27
#define ES_TemplateParser_TemplateParser                               27
#define ES_TemplateParser_build                                        28
#define ES_TemplateParser_buildView                                    29
#define ES_TemplateParser_parse                                        30
#define ES_TemplateParser_getToken                                     31
#define ES_TemplateParser_eatSpace                                     32

#define ES_TemplateParser_NUM_CLASS_PROP                               33

/*
 * Instance slots for "TemplateParser" type 
 */
#define ES_TemplateParser_ContentMarker                                0
#define ES_TemplateParser_ContentPattern                               1
#define ES_TemplateParser_script                                       2
#define ES_TemplateParser_pos                                          3
#define ES_TemplateParser_lineNumber                                   4
#define ES_TemplateParser_Header                                       5
#define ES_TemplateParser_Footer                                       6
#define ES_TemplateParser_MvcHeader                                    7
#define ES_TemplateParser_NUM_INSTANCE_PROP                            8

/*
    Local slots for methods in type "TemplateParser" 
 */
#define ES_TemplateParser_build_script                                 0
#define ES_TemplateParser_build_options                                1
#define ES_TemplateParser_buildView_name                               0
#define ES_TemplateParser_buildView_script                             1
#define ES_TemplateParser_buildView_options                            2
#define ES_TemplateParser_parse_script                                 0
#define ES_TemplateParser_parse_options                                1
#define ES_TemplateParser_getToken_token                               0


/*
    Class property slots for the "Token" type 
 */
#define ES_ejs_web_template_Token__origin                              27
#define ES_ejs_web_template_Token__initializer__Token_initializer      27
#define ES_ejs_web_template_Token_Err                                  28
#define ES_ejs_web_template_Token_Eof                                  29
#define ES_ejs_web_template_Token_EjsTag                               30
#define ES_ejs_web_template_Token_Var                                  31
#define ES_ejs_web_template_Token_Literal                              32
#define ES_ejs_web_template_Token_Equals                               33
#define ES_ejs_web_template_Token_Control                              34
#define ES_ejs_web_template_Token_tokens                               35

#define ES_ejs_web_template_Token_NUM_CLASS_PROP                       36

/*
 * Instance slots for "Token" type 
 */
#define ES_ejs_web_template_Token_NUM_INSTANCE_PROP                    0

#define _ES_CHECKSUM_ejs_web_template   42602

#endif
